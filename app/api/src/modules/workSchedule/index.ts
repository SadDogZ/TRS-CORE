import { Router } from 'express';
import { groupScheduleDays, schedulePeriodSchema, scheduleTemplateSchema, shiftPartnersSchema, workScheduleIntervalDeleteSchema, workScheduleIntervalSchema, workScheduleQuerySchema, workScheduleUpdateSchema, WORK_DAY_STATUSES, type SchedulePeriodRequest, type ScheduleTemplateRequest, type ShiftPartnersRequest } from '@app/shared';
import { currentUser } from '../../core/auth.ts';
import { asyncHandler as h } from '../../core/asyncHandler.ts';
import { adminOnly, deprecateTo, signedIn, type AppModule } from '../../core/module.ts';
import { idParam, validQuery, validate } from '../../core/validate.ts';
import { prisma } from '../../core/db.ts';
import { badRequest } from '../../core/errors.ts';
import { deleteScheduleRange, getScheduleIntervals, intervalDto, replaceScheduleRanges, setScheduleRange } from './schedule.service.ts';
import { assertCanEditSchedule, assertCanReadSchedule, scheduleUsers, visibleScheduleUserIds } from './scheduleAccess.ts';
import { loadAnnualDaily, loadAnnualIntervals, loadDailySchedule, loadIntervalSchedule } from './scheduleQueries.ts';

const deprecateSchedule = deprecateTo('/api/me/work-schedule');
const toDate = (s: string) => new Date(`${s}T00:00:00.000Z`);
const toIsoDate = (d: Date) => d.toISOString().slice(0, 10);
const dateFields = (row: any) => ({ ...row, cycleStart: toIsoDate(row.cycleStart), validFrom: toIsoDate(row.validFrom), validTo: row.validTo ? toIsoDate(row.validTo) : null, startDate: row.startDate ? toIsoDate(row.startDate) : undefined, endDate: row.endDate ? toIsoDate(row.endDate) : undefined });

const dto = (row: any) => ({ id: row.id, userId: row.userId, date: row.date.toISOString().slice(0, 10), status: row.status });
function assertYear(year: number) {
  if (!Number.isInteger(year) || year < 2020 || year > 2100) throw badRequest('Invalid schedule year');
}
const yearOf = (value: unknown) => (typeof value === 'number' ? value : new Date().getFullYear());

/** Workspace schedule: the caller sees and edits only their authorized scope. */
const own = Router();
own.use(...signedIn);
own.get('/users', h(async (req, res) => res.json(await scheduleUsers(await visibleScheduleUserIds(currentUser(req))))));
own.get('/annual', h(async (req, res) => {
  const year = Number(req.query.year) || new Date().getFullYear();
  assertYear(year);
  res.json(await loadAnnualDaily(await visibleScheduleUserIds(currentUser(req)), year));
}));
own.get('/annual/intervals', h(async (req, res) => {
  const year = Number(req.query.year) || new Date().getFullYear();
  assertYear(year);
  res.json(await loadAnnualIntervals(await visibleScheduleUserIds(currentUser(req)), year));
}));
own.get('/', validate(workScheduleQuerySchema, 'query'), h(async (req, res) => {
  const actor = currentUser(req);
  const query = validQuery<{ userId?: number; year?: number }>(req);
  const userId = query.userId ?? actor.id;
  await assertCanReadSchedule(actor, userId);
  res.json(await loadDailySchedule(userId, yearOf(query.year)));
}));
own.get('/intervals', validate(workScheduleQuerySchema, 'query'), h(async (req, res) => {
  const actor = currentUser(req);
  const query = validQuery<{ userId?: number; year?: number }>(req);
  const userId = query.userId ?? actor.id;
  await assertCanReadSchedule(actor, userId);
  res.json(await loadIntervalSchedule(userId, yearOf(query.year)));
}));
own.put('/intervals/:userId', validate(workScheduleIntervalSchema), h(async (req, res) => {
  const actor = currentUser(req);
  const userId = idParam(req, 'userId');
  await assertCanEditSchedule(actor, userId);
  await setScheduleRange(userId, { ...req.body, userId });
  const intervals = await getScheduleIntervals(userId, req.body.startDate, req.body.endDate);
  res.json(intervals.map(intervalDto));
}));
own.delete('/intervals/:userId', validate(workScheduleIntervalDeleteSchema, 'query'), h(async (req, res) => {
  const actor = currentUser(req);
  const userId = idParam(req, 'userId');
  await assertCanEditSchedule(actor, userId);
  const query = validQuery<{ startDate: string; endDate: string }>(req);
  await deleteScheduleRange(userId, query.startDate, query.endDate);
  res.status(204).end();
}));
own.put('/:userId/:date', validate(workScheduleUpdateSchema), h(async (req, res) => {
  const actor = currentUser(req);
  const userId = idParam(req, 'userId');
  await assertCanEditSchedule(actor, userId);
  const input = req.body;
  await setScheduleRange(userId, { userId, startDate: input.date, endDate: input.date, status: input.status });
  const row = await prisma.workScheduleEntry.findUniqueOrThrow({ where: { userId_date: { userId, date: toDate(input.date) } } });
  res.json(dto(row));
}));
own.delete('/:userId/:date', h(async (req, res) => {
  const actor = currentUser(req);
  const userId = idParam(req, 'userId');
  await assertCanEditSchedule(actor, userId);
  await deleteScheduleRange(userId, req.params.date, req.params.date);
  res.status(204).end();
}));
const admin = Router(); admin.use(...adminOnly);
admin.get('/', deprecateSchedule, validate(workScheduleQuerySchema, 'query'), h(async (req, res) => { const q = validQuery<{ userId?: number; year?: number }>(req); if (!q.userId) throw badRequest('Выберите сотрудника'); res.json(await loadDailySchedule(q.userId, yearOf(q.year))); }));
admin.get('/intervals', deprecateSchedule, validate(workScheduleQuerySchema, 'query'), h(async (req, res) => { const q = validQuery<{ userId?: number; year?: number }>(req); if (!q.userId) throw badRequest('Выберите сотрудника'); res.json(await loadIntervalSchedule(q.userId, yearOf(q.year))); }));
admin.get('/users', deprecateSchedule, h(async (_req, res) => res.json(await scheduleUsers(null))));
admin.get('/annual', deprecateSchedule, h(async (req, res) => {
  const year = Number(req.query.year) || new Date().getFullYear();
  assertYear(year);
  res.json(await loadAnnualDaily(null, year));
}));
admin.get('/annual/intervals', deprecateSchedule, h(async (req, res) => {
  const year = Number(req.query.year) || new Date().getFullYear();
  assertYear(year);
  res.json(await loadAnnualIntervals(null, year));
}));
admin.post('/shift-partners/generate', validate(shiftPartnersSchema), h(async (req, res) => {
  const input = req.body as ShiftPartnersRequest;
  if (input.userAId === input.userBId) throw badRequest('Select two different employees');
  const users = await prisma.user.findMany({ where: { id: { in: [input.userAId, input.userBId] }, isDeleted: false, isActive: true }, select: { id: true } });
  if (users.length !== 2) throw badRequest('One or both employees are unavailable');
  const rotationWeeks = Number(input.rotationDays);
  const workDays = rotationWeeks * 7;
  const cycleDays = workDays * 2;
  const start = toDate(input.startDate);
  const end = new Date(Date.UTC(input.year + 1, 0, 1));
  const rows: { userId: number; date: Date; status: (typeof WORK_DAY_STATUSES)[number] }[] = [];
  for (let date = new Date(start); date < end; date.setUTCDate(date.getUTCDate() + 1)) {
    const day = Math.floor((date.getTime() - start.getTime()) / 86400000);
    const cycle = day % cycleDays;
    const statusFor = (isA: boolean) => {
      const workPhase = isA ? cycle < workDays : cycle >= workDays;
      const freePhase = isA ? cycle - workDays : cycle;
      if (!workPhase && (freePhase < input.travelDays || freePhase >= workDays - input.travelDays)) return 'TRAVEL' as const;
      return workPhase ? 'WORK' as const : 'FREE_SHIFT' as const;
    };
    rows.push({ userId: input.userAId, date: new Date(date), status: statusFor(true) }, { userId: input.userBId, date: new Date(date), status: statusFor(false) });
  }
  if (start < end) {
    const grouped = groupScheduleDays(rows.map((row) => ({ userId: row.userId, date: toIsoDate(row.date), status: row.status })));
    await replaceScheduleRanges([input.userAId, input.userBId].map((userId) => ({
      userId,
      startDate: input.startDate,
      endDate: toIsoDate(new Date(end.getTime() - 86400000)),
      intervals: grouped.filter((interval) => interval.userId === userId).map(({ startDate, endDate, status }) => ({ startDate, endDate, status })),
    })));
  }
  res.json({ year: input.year, generated: rows.length, users: [input.userAId, input.userBId] });
}));
admin.get('/templates', h(async (_req, res) => res.json((await prisma.scheduleTemplate.findMany({ include: { user: { select: { id: true, fullName: true } } }, orderBy: { updatedAt: 'desc' } })).map(dateFields))));
admin.post('/templates', validate(scheduleTemplateSchema), h(async (req, res) => { const input = req.body as ScheduleTemplateRequest; const row = await prisma.scheduleTemplate.create({ data: { ...input, userId: input.userId, cycleStart: toDate(input.cycleStart), validFrom: toDate(input.validFrom), validTo: input.validTo ? toDate(input.validTo) : null }, include: { user: { select: { id: true, fullName: true } } } }); res.status(201).json(dateFields(row)); }));
admin.get('/periods', h(async (_req, res) => res.json((await prisma.schedulePeriod.findMany({ include: { user: { select: { id: true, fullName: true } } }, orderBy: { startDate: 'desc' } })).map(dateFields))));
admin.post('/periods', validate(schedulePeriodSchema), h(async (req, res) => { const input = req.body as SchedulePeriodRequest; if (input.endDate < input.startDate) throw badRequest('End date cannot be earlier than start date'); const row = await prisma.schedulePeriod.create({ data: { ...input, startDate: toDate(input.startDate), endDate: toDate(input.endDate) }, include: { user: { select: { id: true, fullName: true } } } }); res.status(201).json(dateFields(row)); }));

admin.put('/intervals/:userId', deprecateSchedule, validate(workScheduleIntervalSchema), h(async (req, res) => {
  const userId = idParam(req, 'userId');
  await setScheduleRange(userId, { ...req.body, userId });
  const intervals = await getScheduleIntervals(userId, req.body.startDate, req.body.endDate);
  res.json(intervals.map(intervalDto));
}));
admin.delete('/intervals/:userId', deprecateSchedule, validate(workScheduleIntervalDeleteSchema, 'query'), h(async (req, res) => {
  const userId = idParam(req, 'userId');
  const query = validQuery<{ startDate: string; endDate: string }>(req);
  await deleteScheduleRange(userId, query.startDate, query.endDate);
  res.status(204).end();
}));
admin.delete('/:userId/:date', deprecateSchedule, h(async (req, res) => { const userId = idParam(req, 'userId'); await deleteScheduleRange(userId, req.params.date, req.params.date); res.status(204).end(); }));
admin.put('/:userId/:date', deprecateSchedule, validate(workScheduleUpdateSchema), h(async (req, res) => { const userId = idParam(req, 'userId'); const input = req.body; await setScheduleRange(userId, { userId, startDate: input.date, endDate: input.date, status: input.status }); const row = await prisma.workScheduleEntry.findUniqueOrThrow({ where: { userId_date: { userId, date: toDate(input.date) } } }); res.json(dto(row)); }));
export const workScheduleModule: AppModule = { name: 'work-schedule', routes: [{ path: '/api/me/work-schedule', router: own }, { path: '/api/admin/work-schedule', router: admin }] };
