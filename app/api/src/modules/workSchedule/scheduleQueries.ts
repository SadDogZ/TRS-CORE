import { countScheduleDaysByStatus, expandScheduleIntervals, WORK_DAY_STATUSES, type WorkDayStatus } from '@app/shared';
import { prisma } from '../../core/db.ts';
import { getAnnualScheduleIntervals, getScheduleIntervals, intervalDto, yearBounds } from './schedule.service.ts';

export async function loadDailySchedule(userId: number, year: number) {
  const bounds = yearBounds(year);
  const intervals = (await getScheduleIntervals(userId, bounds.startDate, bounds.endDate)).map(intervalDto);
  const expanded = expandScheduleIntervals(intervals, bounds.startDate, bounds.endDate);
  const entries = [...expanded.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, status], index) => ({ id: index + 1, userId, date, status }));
  const stats = Object.fromEntries(
    WORK_DAY_STATUSES.map((status) => [status, entries.filter((entry) => entry.status === status).length]),
  ) as Record<WorkDayStatus, number>;
  return { userId, year, entries, stats };
}

export async function loadIntervalSchedule(userId: number, year: number) {
  const bounds = yearBounds(year);
  const intervals = (await getScheduleIntervals(userId, bounds.startDate, bounds.endDate)).map(intervalDto);
  return { userId, year, intervals, stats: countScheduleDaysByStatus(intervals, bounds.startDate, bounds.endDate) };
}

export async function loadAnnualDaily(userIds: number[] | null, year: number) {
  const bounds = yearBounds(year);
  const users = await prisma.user.findMany({
    where: { isDeleted: false, isActive: true, ...(userIds ? { id: { in: userIds } } : {}) },
    select: { id: true, fullName: true },
    orderBy: { fullName: 'asc' },
  });
  const intervals = (await getAnnualScheduleIntervals(
    users.map(({ id }) => id),
    bounds.startDate,
    bounds.endDate,
  )).map(intervalDto);
  const byUser = new Map<number, Array<{ id: number; userId: number; date: string; status: WorkDayStatus }>>();
  for (const user of users) {
    const userIntervals = intervals.filter((interval) => interval.userId === user.id);
    const expanded = expandScheduleIntervals(userIntervals, bounds.startDate, bounds.endDate);
    byUser.set(
      user.id,
      [...expanded.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, status], index) => ({ id: index + 1, userId: user.id, date, status })),
    );
  }
  return { year, rows: users.map((user) => ({ user, entries: byUser.get(user.id) ?? [] })) };
}

export async function loadAnnualIntervals(userIds: number[] | null, year: number) {
  const bounds = yearBounds(year);
  const users = await prisma.user.findMany({
    where: { isDeleted: false, isActive: true, ...(userIds ? { id: { in: userIds } } : {}) },
    select: { id: true, fullName: true },
    orderBy: { fullName: 'asc' },
  });
  const intervals = (await getAnnualScheduleIntervals(
    users.map(({ id }) => id),
    bounds.startDate,
    bounds.endDate,
  )).map(intervalDto);
  const byUser = new Map<number, typeof intervals>();
  for (const interval of intervals) byUser.set(interval.userId, [...(byUser.get(interval.userId) ?? []), interval]);
  return { year, rows: users.map((user) => ({ user, intervals: byUser.get(user.id) ?? [] })) };
}
