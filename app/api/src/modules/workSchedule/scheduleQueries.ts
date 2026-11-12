import { countScheduleDaysByStatus, WORK_DAY_STATUSES, type WorkDayStatus } from '@app/shared';
import { prisma } from '../../core/db.ts';
import { getAnnualScheduleIntervals, getScheduleIntervals, intervalDto, yearBounds } from './schedule.service.ts';

const yearStart = (year: number) => new Date(Date.UTC(year, 0, 1));
const nextYear = (year: number) => new Date(Date.UTC(year + 1, 0, 1));
const dto = (row: { id: number; userId: number; date: Date; status: WorkDayStatus }) => ({
  id: row.id,
  userId: row.userId,
  date: row.date.toISOString().slice(0, 10),
  status: row.status,
});

export async function loadDailySchedule(userId: number, year: number) {
  const entries = await prisma.workScheduleEntry.findMany({
    where: { userId, date: { gte: yearStart(year), lt: nextYear(year) } },
    orderBy: { date: 'asc' },
  });
  const stats = Object.fromEntries(WORK_DAY_STATUSES.map((status) => [status, entries.filter((entry) => entry.status === status).length]));
  return { userId, year, entries: entries.map(dto), stats };
}

export async function loadIntervalSchedule(userId: number, year: number) {
  const bounds = yearBounds(year);
  const intervals = (await getScheduleIntervals(userId, bounds.startDate, bounds.endDate)).map(intervalDto);
  return { userId, year, intervals, stats: countScheduleDaysByStatus(intervals, bounds.startDate, bounds.endDate) };
}

export async function loadAnnualDaily(userIds: number[] | null, year: number) {
  const users = await prisma.user.findMany({
    where: { isDeleted: false, isActive: true, ...(userIds ? { id: { in: userIds } } : {}) },
    select: { id: true, fullName: true },
    orderBy: { fullName: 'asc' },
  });
  const entries = await prisma.workScheduleEntry.findMany({
    where: {
      ...(userIds ? { userId: { in: users.map(({ id }) => id) } } : {}),
      date: { gte: yearStart(year), lt: nextYear(year) },
    },
    orderBy: { date: 'asc' },
  });
  const byUser = new Map<number, ReturnType<typeof dto>[]>();
  for (const entry of entries) byUser.set(entry.userId, [...(byUser.get(entry.userId) ?? []), dto(entry)]);
  return { year, rows: users.map((user) => ({ user, entries: byUser.get(user.id) ?? [] })) };
}

export async function loadAnnualIntervals(userIds: number[] | null, year: number) {
  const bounds = yearBounds(year);
  const users = await prisma.user.findMany({
    where: { isDeleted: false, isActive: true, ...(userIds ? { id: { in: userIds } } : {}) },
    select: { id: true, fullName: true },
    orderBy: { fullName: 'asc' },
  });
  const intervals = (await getAnnualScheduleIntervals(users.map(({ id }) => id), bounds.startDate, bounds.endDate)).map(intervalDto);
  const byUser = new Map<number, typeof intervals>();
  for (const interval of intervals) byUser.set(interval.userId, [...(byUser.get(interval.userId) ?? []), interval]);
  return { year, rows: users.map((user) => ({ user, intervals: byUser.get(user.id) ?? [] })) };
}
