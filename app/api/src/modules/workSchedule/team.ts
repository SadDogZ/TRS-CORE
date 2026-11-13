import { Router } from 'express';
import { workScheduleIntervalDeleteSchema, workScheduleIntervalSchema, workScheduleQuerySchema, workScheduleUpdateSchema, WORK_DAY_STATUSES } from '@app/shared';
import { currentUser } from '../../core/auth.ts';
import { asyncHandler as h } from '../../core/asyncHandler.ts';
import { deprecateTo, signedIn, type AppModule } from '../../core/module.ts';
import { idParam, validQuery, validate } from '../../core/validate.ts';
import { badRequest, forbidden } from '../../core/errors.ts';
import { prisma } from '../../core/db.ts';
import { manageableUserIds, systemRoleCodes } from '../../core/organizationAccess.ts';
import { dayEntryDto, deleteScheduleRange, getScheduleIntervals, intervalDto, setScheduleRange } from './schedule.service.ts';
import { loadAnnualDaily, loadAnnualIntervals, loadDailySchedule, loadIntervalSchedule } from './scheduleQueries.ts';

const deprecateSchedule = deprecateTo('/api/me/work-schedule');

async function assertScheduleManager(userId: number) {
  const scheduleManagerRoles = ['MANAGER', 'COORDINATOR'];
  const roles = await systemRoleCodes(userId);
  if (!roles.some((role) => scheduleManagerRoles.includes(role))) throw forbidden();
}

async function assertUserInScope(actorId: number, userId: number) {
  const ids = await manageableUserIds(await prisma.user.findUniqueOrThrow({ where: { id: actorId } }));
  if (!ids.includes(userId)) throw forbidden();
}

function assertYear(year: number) {
  if (!Number.isInteger(year) || year < 2020 || year > 2100) throw badRequest('Invalid schedule year');
}

const team = Router();
team.use(...signedIn);
team.use(deprecateSchedule);
teamsRoutes();
function teamsRoutes() {
  team.get('/users', h(async (req, res) => {
    await assertScheduleManager(currentUser(req).id);
    const ids = await manageableUserIds(currentUser(req));
    res.json(await prisma.user.findMany({ where: { id: { in: ids }, isDeleted: false, isActive: true }, select: { id: true, fullName: true, login: true }, orderBy: { fullName: 'asc' } }));
  }));
  team.get('/annual', h(async (req, res) => {
    const actor = currentUser(req);
    await assertScheduleManager(actor.id);
    const year = Number(req.query.year) || new Date().getFullYear();
    if (!Number.isInteger(year) || year < 2020 || year > 2100) throw badRequest('Invalid schedule year');
    res.json(await loadAnnualDaily(await manageableUserIds(actor), year));
  }));
  team.get('/annual/intervals', h(async (req, res) => {
    const actor = currentUser(req);
    await assertScheduleManager(actor.id);
    const year = Number(req.query.year) || new Date().getFullYear();
    assertYear(year);
    res.json(await loadAnnualIntervals(await manageableUserIds(actor), year));
  }));
  team.get('/', validate(workScheduleQuerySchema, 'query'), h(async (req, res) => {
    const actor = currentUser(req);
    await assertScheduleManager(actor.id);
    const query = validQuery<{ userId?: number; year?: number }>(req);
    if (!query.userId) throw badRequest('Choose an employee');
    await assertUserInScope(actor.id, query.userId);
    res.json(await loadDailySchedule(query.userId, query.year ?? new Date().getFullYear()));
  }));
  team.get('/intervals', validate(workScheduleQuerySchema, 'query'), h(async (req, res) => {
    const actor = currentUser(req);
    await assertScheduleManager(actor.id);
    const query = validQuery<{ userId?: number; year?: number }>(req);
    if (!query.userId) throw badRequest('Choose an employee');
    await assertUserInScope(actor.id, query.userId);
    res.json(await loadIntervalSchedule(query.userId, query.year ?? new Date().getFullYear()));
  }));
  team.put('/intervals/:userId', validate(workScheduleIntervalSchema), h(async (req, res) => {
    const actor = currentUser(req);
    await assertScheduleManager(actor.id);
    const userId = idParam(req, 'userId');
    await assertUserInScope(actor.id, userId);
    await setScheduleRange(userId, { ...req.body, userId });
    const intervals = await getScheduleIntervals(userId, req.body.startDate, req.body.endDate);
    res.json(intervals.map(intervalDto));
  }));
  team.delete('/intervals/:userId', validate(workScheduleIntervalDeleteSchema, 'query'), h(async (req, res) => {
    const actor = currentUser(req);
    await assertScheduleManager(actor.id);
    const userId = idParam(req, 'userId');
    await assertUserInScope(actor.id, userId);
    const query = validQuery<{ startDate: string; endDate: string }>(req);
    await deleteScheduleRange(userId, query.startDate, query.endDate);
    res.status(204).end();
  }));
  team.put('/:userId/:date', validate(workScheduleUpdateSchema), h(async (req, res) => {
    const actor = currentUser(req);
    await assertScheduleManager(actor.id);
    const userId = idParam(req, 'userId');
    await assertUserInScope(actor.id, userId);
    const input = req.body as { date: string; status: (typeof WORK_DAY_STATUSES)[number] };
    await setScheduleRange(userId, { userId, startDate: input.date, endDate: input.date, status: input.status });
    res.json(dayEntryDto(userId, input.date, input.status));
  }));
  team.delete('/:userId/:date', h(async (req, res) => {
    const actor = currentUser(req);
    await assertScheduleManager(actor.id);
    const userId = idParam(req, 'userId');
    await assertUserInScope(actor.id, userId);
    const date = req.params.date;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00.000Z`))) throw badRequest('Invalid date');
    await deleteScheduleRange(userId, date, date);
    res.status(204).end();
  }));
}

export const teamWorkScheduleModule: AppModule = {
  name: 'team-work-schedule',
  routes: [{ path: '/api/team/work-schedule', router: team }],
};
