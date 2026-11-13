import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { prisma } from '../src/core/db.ts';
import { api, createUser, resetDb, startServer, stopServer, tokenFor } from './helpers.ts';

describe('messages scope and schedule generation', () => {
  before(startServer);
  after(stopServer);
  beforeEach(resetDb);

  it('allows scoped messaging and blocks out-of-scope recipients', async () => {
    const admin = await createUser('ADMIN');
    const manager = await createUser('MANAGER');
    const employee = await createUser('EMPLOYEE');
    const outsider = await createUser('EMPLOYEE');
    const adminToken = await tokenFor(admin.login);
    const managerToken = await tokenFor(manager.login);
    const employeeToken = await tokenFor(employee.login);

    const base = await prisma.base.create({ data: { name: 'Msg Base', code: 'MSG_BASE' } });
    const managerEmployee = await prisma.employee.findUniqueOrThrow({ where: { userId: manager.id } });
    const employeeCard = await prisma.employee.findUniqueOrThrow({ where: { userId: employee.id } });
    const outsiderCard = await prisma.employee.findUniqueOrThrow({ where: { userId: outsider.id } });
    const otherBase = await prisma.base.create({ data: { name: 'Other Msg Base', code: 'MSG_OTHER' } });
    await prisma.employeeAssignment.update({
      where: { activeEmployeeId: managerEmployee.id },
      data: { track: 'TRS', baseId: base.id, positionId: manager.positionId },
    });
    await prisma.employeeAssignment.update({
      where: { activeEmployeeId: employeeCard.id },
      data: { track: 'TRS', baseId: base.id, positionId: employee.positionId, supervisorEmployeeId: managerEmployee.id, managerId: managerEmployee.id },
    });
    await prisma.employeeAssignment.update({
      where: { activeEmployeeId: outsiderCard.id },
      data: { track: 'TRS', baseId: otherBase.id, positionId: outsider.positionId },
    });

    const recipients = await api('GET', '/api/me/messages/recipients', { token: managerToken });
    assert.equal(recipients.status, 200);
    assert.equal(recipients.body.some((row: { id: number }) => row.id === employee.id), true);
    assert.equal(recipients.body.some((row: { id: number }) => row.id === outsider.id), false);

    const sent = await api('POST', '/api/me/messages', {
      token: managerToken,
      body: { recipient: 'user', userId: employee.id, subject: 'Смена', body: 'Проверьте график' },
    });
    assert.equal(sent.status, 201, JSON.stringify(sent.body));

    const denied = await api('POST', '/api/me/messages', {
      token: managerToken,
      body: { recipient: 'user', userId: outsider.id, subject: 'Нет', body: 'Чужая база' },
    });
    assert.equal(denied.status, 403);

    const inbox = await api('GET', '/api/me/messages', { token: employeeToken });
    assert.equal(inbox.status, 200);
    assert.equal(inbox.body.items.some((row: { subject: string }) => row.subject === 'Смена'), true);

    const unread = await api('GET', '/api/me/notifications/unread-count', { token: employeeToken });
    assert.equal(unread.status, 200);
    assert.ok(unread.body.count >= 1);

    const broadcastDenied = await api('POST', '/api/me/messages', {
      token: managerToken,
      body: { recipient: 'all', subject: 'Всем', body: 'Нельзя' },
    });
    assert.equal(broadcastDenied.status, 403);

    const broadcast = await api('POST', '/api/me/messages', {
      token: adminToken,
      body: { recipient: 'all', subject: 'Всем', body: 'Админ' },
    });
    assert.equal(broadcast.status, 201, JSON.stringify(broadcast.body));
  });

  it('previews schedule conflicts and applies only with force', async () => {
    const manager = await createUser('MANAGER');
    const employee = await createUser('EMPLOYEE');
    const managerToken = await tokenFor(manager.login);
    const base = await prisma.base.create({ data: { name: 'Sched Base', code: 'SCH_BASE' } });
    const managerEmployee = await prisma.employee.findUniqueOrThrow({ where: { userId: manager.id } });
    const employeeCard = await prisma.employee.findUniqueOrThrow({ where: { userId: employee.id } });
    await prisma.employeeAssignment.update({
      where: { activeEmployeeId: managerEmployee.id },
      data: { track: 'TRS', baseId: base.id, positionId: manager.positionId },
    });
    await prisma.employeeAssignment.update({
      where: { activeEmployeeId: employeeCard.id },
      data: { track: 'TRS', baseId: base.id, positionId: employee.positionId, supervisorEmployeeId: managerEmployee.id, managerId: managerEmployee.id },
    });

    const seed = await api('PUT', `/api/me/work-schedule/intervals/${employee.id}`, {
      token: managerToken,
      body: { startDate: '2026-03-01', endDate: '2026-03-05', status: 'VACATION' },
    });
    assert.equal(seed.status, 200, JSON.stringify(seed.body));

    const preview = await api('POST', '/api/me/work-schedule/generate', {
      token: managerToken,
      body: {
        userIds: [employee.id],
        startDate: '2026-03-01',
        endDate: '2026-03-28',
        workDays: 7,
        restDays: 7,
        travelDays: 1,
        apply: false,
      },
    });
    assert.equal(preview.status, 200, JSON.stringify(preview.body));
    assert.equal(preview.body.conflicts.length, 1);
    assert.equal(preview.body.applied, false);

    const blocked = await api('POST', '/api/me/work-schedule/generate', {
      token: managerToken,
      body: {
        userIds: [employee.id],
        startDate: '2026-03-01',
        endDate: '2026-03-28',
        workDays: 7,
        restDays: 7,
        apply: true,
        force: false,
      },
    });
    assert.equal(blocked.status, 409);

    const forced = await api('POST', '/api/me/work-schedule/generate', {
      token: managerToken,
      body: {
        userIds: [employee.id],
        startDate: '2026-03-01',
        endDate: '2026-03-28',
        workDays: 7,
        restDays: 7,
        apply: true,
        force: true,
      },
    });
    assert.equal(forced.status, 200, JSON.stringify(forced.body));
    assert.equal(forced.body.applied, true);
  });
});
