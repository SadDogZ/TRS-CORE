import type { User } from '@prisma/client';
import { addDays, groupScheduleDays, type ScheduleGenerateRequest, type WorkDayStatus } from '@app/shared';
import { prisma } from '../../core/db.ts';
import { badRequest, conflict } from '../../core/errors.ts';
import { assertCanEditSchedule } from './scheduleAccess.ts';
import { getScheduleIntervals, replaceScheduleRanges } from './schedule.service.ts';

export interface ScheduleGenerateConflict {
  userId: number;
  fullName: string;
  intervals: Array<{ startDate: string; endDate: string; status: string }>;
}

export interface ScheduleGeneratePreview {
  dryRun: boolean;
  applied: boolean;
  generatedDays: number;
  users: Array<{ userId: number; fullName: string; intervals: number }>;
  conflicts: ScheduleGenerateConflict[];
}

function buildIntervals(userId: number, input: ScheduleGenerateRequest) {
  const travelDays = input.travelDays ?? 0;
  const cycle = input.workDays + input.restDays;
  const rows: { userId: number; date: string; status: WorkDayStatus }[] = [];
  for (let date = input.startDate; date <= input.endDate; date = addDays(date, 1)) {
    const offset = Math.floor((Date.parse(`${date}T00:00:00.000Z`) - Date.parse(`${input.startDate}T00:00:00.000Z`)) / 86400000);
    const phase = offset % cycle;
    let status: WorkDayStatus;
    if (phase < input.workDays) status = 'WORK';
    else {
      const restPhase = phase - input.workDays;
      status =
        travelDays > 0 && (restPhase < travelDays || restPhase >= input.restDays - travelDays)
          ? 'TRAVEL'
          : 'FREE_SHIFT';
    }
    rows.push({ userId, date, status });
  }
  return groupScheduleDays(rows).map(({ startDate, endDate, status }) => ({ startDate, endDate, status }));
}

export async function generateScopedSchedule(actor: User, input: ScheduleGenerateRequest): Promise<ScheduleGeneratePreview> {
  const uniqueIds = [...new Set(input.userIds)];
  for (const userId of uniqueIds) await assertCanEditSchedule(actor, userId);

  const users = await prisma.user.findMany({
    where: { id: { in: uniqueIds }, isDeleted: false, isActive: true },
    select: { id: true, fullName: true },
  });
  if (users.length !== uniqueIds.length) throw badRequest('Один или несколько сотрудников недоступны');

  const planned = users.map((user) => ({
    userId: user.id,
    fullName: user.fullName,
    intervals: buildIntervals(user.id, input),
  }));

  const conflicts: ScheduleGenerateConflict[] = [];
  for (const item of planned) {
    const existing = await getScheduleIntervals(item.userId, input.startDate, input.endDate);
    if (existing.length > 0) {
      conflicts.push({
        userId: item.userId,
        fullName: item.fullName,
        intervals: existing.map((row) => ({
          startDate: row.startDate.toISOString().slice(0, 10),
          endDate: row.endDate.toISOString().slice(0, 10),
          status: row.status,
        })),
      });
    }
  }

  const apply = input.apply === true;
  if (!apply) {
    return {
      dryRun: true,
      applied: false,
      generatedDays: planned.reduce((sum, item) => sum + item.intervals.reduce((days, interval) => {
        const start = Date.parse(`${interval.startDate}T00:00:00.000Z`);
        const end = Date.parse(`${interval.endDate}T00:00:00.000Z`);
        return days + Math.floor((end - start) / 86400000) + 1;
      }, 0), 0),
      users: planned.map((item) => ({ userId: item.userId, fullName: item.fullName, intervals: item.intervals.length })),
      conflicts,
    };
  }

  if (conflicts.length > 0 && input.force !== true) {
    throw conflict('В выбранном периоде уже есть записи графика. Подтвердите перезапись (force) или измените период.');
  }

  await replaceScheduleRanges(
    planned.map((item) => ({
      userId: item.userId,
      startDate: input.startDate,
      endDate: input.endDate,
      intervals: item.intervals,
    })),
  );

  return {
    dryRun: false,
    applied: true,
    generatedDays: planned.reduce((sum, item) => sum + item.intervals.reduce((days, interval) => {
      const start = Date.parse(`${interval.startDate}T00:00:00.000Z`);
      const end = Date.parse(`${interval.endDate}T00:00:00.000Z`);
      return days + Math.floor((end - start) / 86400000) + 1;
    }, 0), 0),
    users: planned.map((item) => ({ userId: item.userId, fullName: item.fullName, intervals: item.intervals.length })),
    conflicts,
  };
}
