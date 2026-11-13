/**
 * Демо-данные TRS Core: 50 сотрудников, 5 баз, договоры, 10 заполненных удостоверений, вахтовые шаблоны.
 * Запуск после стандартного сида: npm run seed && npm run seed:demo
 */
import { addDays, addMonths, todayInTimezone } from '@app/shared';
import { prisma } from '../src/core/db.ts';
import * as users from '../src/modules/users/users.service.ts';
import {
  assignEmployee,
  createAddendum,
  createContract,
  createCustomer,
  setAccountRoles,
  setEmployeeManager,
} from '../src/modules/organization/organization.service.ts';
import * as credentials from '../src/modules/credentials/credentials.service.ts';
import {
  ALLOWED_POSITIONS,
  BASE_DEFS,
  DEMO_CUSTOMERS,
  DEMO_PASSWORD,
  ROTATION_TEMPLATE_NAME,
  buildDemoRoster,
  positionIdByName,
  type DemoEmployeeSpec,
} from './seed-shared.ts';

const settingsTz = 'Europe/Moscow';

async function ensureUser(actor: { id: number }, spec: DemoEmployeeSpec) {
  const positionId = await positionIdByName(spec.position, spec.orgRole);
  let row = await prisma.user.findUnique({ where: { login: spec.login } });
  if (!row) {
    await users.create(actor as never, {
      fullName: spec.fullName,
      login: spec.login,
      password: DEMO_PASSWORD,
      positionId,
      phone: spec.phone,
      email: spec.email,
    });
    row = await prisma.user.findUniqueOrThrow({ where: { login: spec.login } });
  } else {
    await users.update(actor as never, row.id, {
      fullName: spec.fullName,
      positionId,
      phone: spec.phone,
      email: spec.email,
      isActive: true,
    });
    row = await prisma.user.findUniqueOrThrow({ where: { login: spec.login } });
  }
  if (row.mustChangePassword) {
    await prisma.user.update({ where: { id: row.id }, data: { mustChangePassword: false } });
  }
  await setAccountRoles(actor as never, row.id, { roles: [spec.orgRole] });
  return row;
}

async function ensureAssignment(
  actor: { id: number },
  userId: number,
  spec: DemoEmployeeSpec,
  employeeIdByLogin: Map<string, number>,
  baseIdByCode: Map<string, number>,
  today: string,
) {
  const employee = await prisma.employee.findUniqueOrThrow({ where: { userId } });
  const desiredBaseId = spec.baseCode ? baseIdByCode.get(spec.baseCode) ?? null : null;
  if (spec.baseCode && desiredBaseId == null) throw new Error(`Base ${spec.baseCode} is missing; run npm run seed first`);
  const supervisorEmployeeId = spec.supervisorLogin ? employeeIdByLogin.get(spec.supervisorLogin) : undefined;
  if (spec.supervisorLogin && !supervisorEmployeeId) throw new Error(`Supervisor ${spec.supervisorLogin} is missing`);
  const managerEmployeeId = spec.managerLogin ? employeeIdByLogin.get(spec.managerLogin) : undefined;
  if (spec.managerLogin && !managerEmployeeId) throw new Error(`Manager ${spec.managerLogin} is missing`);

  const current = await prisma.employeeAssignment.findUnique({ where: { activeEmployeeId: employee.id } });
  const desiredPositionId = await positionIdByName(spec.position, spec.orgRole);
  const needsAssign =
    !current ||
    current.track === 'UNASSIGNED' ||
    current.track !== spec.track ||
    current.positionId !== desiredPositionId ||
    current.baseId !== desiredBaseId ||
    (supervisorEmployeeId ? current.supervisorEmployeeId !== supervisorEmployeeId : false);

  if (needsAssign) {
    if (current && current.track !== 'UNASSIGNED' && current.startsAt.toISOString().slice(0, 10) === today) {
      // Same-day transfer is blocked; adjust in place for demo-owned rows only.
      await prisma.employeeAssignment.update({
        where: { id: current.id },
        data: {
          track: spec.track,
          positionId: desiredPositionId,
          baseId: desiredBaseId,
          supervisorEmployeeId: supervisorEmployeeId ?? null,
          managerId: managerEmployeeId ?? null,
          reason: 'Демо-сид: синхронизация назначения',
        },
      });
    } else {
      await assignEmployee(actor as never, employee.id, {
        track: spec.track,
        ...(desiredBaseId != null ? { baseId: desiredBaseId } : {}),
        ...(supervisorEmployeeId ? { supervisorEmployeeId } : {}),
        ...(managerEmployeeId ? { managerId: managerEmployeeId } : {}),
        positionId: desiredPositionId,
        startsAt: today,
        reason: 'Демо-назначение TRS Core',
      });
    }
  } else if (managerEmployeeId && current && current.managerId !== managerEmployeeId) {
    await setEmployeeManager(actor as never, employee.id, managerEmployeeId);
  } else if (!managerEmployeeId && current?.managerId) {
    await prisma.employeeAssignment.update({ where: { id: current.id }, data: { managerId: null } });
  }
}

async function ensureRotationTemplate(userId: number, today: string) {
  const existing = await prisma.scheduleTemplate.findFirst({
    where: { userId, name: ROTATION_TEMPLATE_NAME },
    orderBy: { id: 'asc' },
  });
  if (existing) {
    await prisma.scheduleTemplate.update({
      where: { id: existing.id },
      data: {
        workDays: 14,
        restDays: 14,
        cycleStart: new Date(`${today}T00:00:00.000Z`),
        validFrom: new Date(`${today}T00:00:00.000Z`),
        validTo: null,
        isActive: true,
      },
    });
    return;
  }
  await prisma.scheduleTemplate.create({
    data: {
      userId,
      name: ROTATION_TEMPLATE_NAME,
      workDays: 14,
      restDays: 14,
      cycleStart: new Date(`${today}T00:00:00.000Z`),
      validFrom: new Date(`${today}T00:00:00.000Z`),
      isActive: true,
    },
  });
}

async function ensureCustomersAndContracts(actor: { id: number }) {
  const activeStatus = await prisma.contractStatus.findUniqueOrThrow({ where: { code: 'ACTIVE' } });
  const addendumStatus = await prisma.addendumStatus.findUniqueOrThrow({ where: { code: 'ACTIVE' } });
  const bases = new Map((await prisma.base.findMany({ where: { code: { in: BASE_DEFS.map((b) => b.code) } } })).map((b) => [b.code!, b.id]));

  for (const [customerIndex, customerDef] of DEMO_CUSTOMERS.entries()) {
    const baseId = bases.get(customerDef.baseCode);
    if (!baseId) throw new Error(`Base ${customerDef.baseCode} missing for customer ${customerDef.code}`);

    let customer = await prisma.customer.findUnique({ where: { code: customerDef.code } });
    if (!customer) {
      customer = await createCustomer(actor as never, {
        name: customerDef.name,
        code: customerDef.code,
        address: customerDef.address,
      });
    } else {
      customer = await prisma.customer.update({
        where: { id: customer.id },
        data: { name: customerDef.name, address: customerDef.address, isActive: true, baseId },
      });
    }
    if (customer.baseId !== baseId) {
      customer = await prisma.customer.update({ where: { id: customer.id }, data: { baseId } });
    }

    for (let contractIndex = 1; contractIndex <= 3; contractIndex += 1) {
      const number = `${customerDef.code}-C${String(contractIndex).padStart(2, '0')}`;
      let contract = await prisma.contract.findUnique({ where: { baseId_number: { baseId, number } } });
      if (!contract) {
        contract = await createContract(actor as never, baseId, {
          customerId: customer.id,
          statusId: activeStatus.id,
          number,
          startsAt: '2026-01-01',
          endsAt: '2027-12-31',
        });
      }

      if (contractIndex === 1) {
        const addendumNumber = `${number}-A01`;
        const existingAddendum = await prisma.contractAddendum.findUnique({
          where: { contractId_number: { contractId: contract.id, number: addendumNumber } },
        });
        if (!existingAddendum) {
          await createAddendum(actor as never, contract.id, {
            statusId: addendumStatus.id,
            number: addendumNumber,
            startsAt: '2026-02-01',
            endsAt: '2027-06-30',
            description: `Дополнительное соглашение к договору ${number} для ${customerDef.name}`,
          });
        }
      }
    }

    void customerIndex;
  }
}

async function ensureFilledCertificates(actor: { id: number }, rosterUserIds: number[], today: string) {
  const catalog = await prisma.credential.findMany({ where: { isArchived: false }, orderBy: { sortOrder: 'asc' }, take: 5 });
  if (catalog.length < 1) throw new Error('Credential catalog is empty; run npm run seed first');

  const targets = rosterUserIds.slice(0, 10);
  for (const [index, userId] of targets.entries()) {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const credential = catalog[index % catalog.length]!;
    let row = await prisma.userCredential.findUnique({
      where: { userId_credentialId: { userId, credentialId: credential.id } },
    });
    if (!row) {
      row = await prisma.userCredential.create({
        data: { userId, credentialId: credential.id },
      });
    }
    const daysLeft = 30 + index * 17;
    const issueDate = addMonths(addDays(today, daysLeft), -credential.validityMonths);
    await credentials.updateOwn(user, row.id, issueDate);
    await credentials.adminUpdate(actor as never, row.id, {
      number: `УД-2026-${String(1000 + index).padStart(4, '0')}`,
    });
  }
}

async function verifyDemoData(rosterLogins: string[]) {
  const baseCodes = BASE_DEFS.map((b) => b.code);
  const bases = await prisma.base.findMany({ where: { code: { in: [...baseCodes] } } });
  const users = await prisma.user.findMany({
    where: { login: { in: rosterLogins }, isDeleted: false },
    include: {
      position: true,
      employee: {
        include: {
          assignments: {
            where: { activeEmployeeId: { not: null } },
            include: { supervisor: true, manager: true, base: true },
          },
        },
      },
      scheduleTemplates: { where: { name: ROTATION_TEMPLATE_NAME, isActive: true } },
    },
  });
  const customerCodes = DEMO_CUSTOMERS.map((item) => item.code);
  const customers = await prisma.customer.findMany({ where: { code: { in: [...customerCodes] } } });
  const contracts = await prisma.contract.findMany({
    where: { customer: { code: { in: [...customerCodes] } } },
  });
  const addenda = await prisma.contractAddendum.findMany({
    where: { contract: { customer: { code: { in: [...customerCodes] } } } },
  });
  const filledCredentials = await prisma.userCredential.count({
    where: {
      user: { login: { in: rosterLogins } },
      issueDate: { not: null },
      number: { not: null },
      isMarkedForDeletion: false,
    },
  });

  const byBase = new Map<string, number>();
  const byPosition = new Map<string, number>();
  let missingManager = 0;
  let missingSupervisor = 0;
  let missingSchedule = 0;
  let profileGaps = 0;
  let foreignPositions = 0;

  for (const user of users) {
    const assignment = user.employee?.assignments[0];
    const baseCode = assignment?.base?.code ?? (user.position?.name === 'Старший механик' ? 'RU-WIDE' : 'NONE');
    byBase.set(baseCode, (byBase.get(baseCode) ?? 0) + 1);
    const positionName = user.position?.name ?? '—';
    byPosition.set(positionName, (byPosition.get(positionName) ?? 0) + 1);
    if (!ALLOWED_POSITIONS.includes(positionName as (typeof ALLOWED_POSITIONS)[number])) foreignPositions += 1;
    if (user.position?.name !== 'Старший механик' && user.position?.name !== 'Менеджер БПО') {
      if (!assignment?.managerId) missingManager += 1;
    }
    if (!['Старший механик', 'Менеджер БПО'].includes(user.position?.name ?? '') && !assignment?.supervisorEmployeeId) {
      missingSupervisor += 1;
    }
    if (user.scheduleTemplates.length === 0) missingSchedule += 1;
    const emptyOptional = [user.phone, user.email, user.photoFile, user.employee?.employeeNumber].filter((v) => !v).length;
    if (emptyOptional > 2) profileGaps += 1;
  }

  const rosterEmployeeIds = users.map((user) => user.employee!.id);
  const mechanicsPerBase = await Promise.all(
    BASE_DEFS.map(async (base) => ({
      code: base.code,
      mechanics: await prisma.employeeAssignment.count({
        where: {
          activeEmployeeId: { in: rosterEmployeeIds },
          base: { code: base.code },
          position: { name: 'Механик' },
        },
      }),
      masters: await prisma.employeeAssignment.count({
        where: {
          activeEmployeeId: { in: rosterEmployeeIds },
          base: { code: base.code },
          position: { name: 'Мастер цеха' },
        },
      }),
      managers: await prisma.employeeAssignment.count({
        where: {
          activeEmployeeId: { in: rosterEmployeeIds },
          base: { code: base.code },
          position: { name: 'Менеджер БПО' },
        },
      }),
      coordinators: await prisma.employeeAssignment.count({
        where: {
          activeEmployeeId: { in: rosterEmployeeIds },
          base: { code: base.code },
          position: { name: 'Координатор проекта' },
        },
      }),
    })),
  );

  const seniorMechanics = await prisma.employeeAssignment.count({
    where: {
      activeEmployeeId: { in: rosterEmployeeIds },
      position: { name: 'Старший механик' },
      baseId: null,
    },
  });

  return {
    bases: bases.length,
    employees: users.length,
    customers: customers.length,
    contracts: contracts.length,
    addenda: addenda.length,
    filledCredentials,
    missingManager,
    missingSupervisor,
    missingSchedule,
    profileGaps,
    byBase: Object.fromEntries(byBase),
    byPosition: Object.fromEntries(byPosition),
    mechanicsPerBase,
    seniorMechanics,
    foreignPositions,
  };
}

async function main() {
  const admin = await prisma.user.findFirst({
    where: { isDeleted: false, systemRoles: { some: { revokedAt: null, systemRole: { code: 'ADMIN', isActive: true } } } },
    orderBy: { id: 'asc' },
  });
  if (!admin) throw new Error('Нет администратора — сначала выполните npm run seed');

  const today = todayInTimezone(settingsTz);
  const roster = buildDemoRoster();

  // Create users in dependency order: senior mech + managers, then supervisors' dependents.
  const orderRank = (spec: DemoEmployeeSpec) => {
    if (spec.orgRole === 'SENIOR_MECHANIC') return 0;
    if (spec.orgRole === 'MANAGER') return 1;
    if (spec.orgRole === 'COORDINATOR') return 2;
    if (spec.orgRole === 'MECHANIC') return 3;
    if (spec.orgRole === 'SHOP_FOREMAN') return 4;
    return 5;
  };
  const ordered = [...roster].sort((a, b) => orderRank(a) - orderRank(b));

  const userIdByLogin = new Map<string, number>();
  for (const spec of ordered) {
    const user = await ensureUser(admin, spec);
    userIdByLogin.set(spec.login, user.id);
  }

  const employeeIdByLogin = new Map<string, number>();
  for (const [login, userId] of userIdByLogin) {
    const employee = await prisma.employee.findUniqueOrThrow({ where: { userId } });
    employeeIdByLogin.set(login, employee.id);
  }

  const baseIdByCode = new Map(
    (await prisma.base.findMany({ where: { code: { in: BASE_DEFS.map((b) => b.code) } } })).map((b) => [b.code!, b.id]),
  );
  if (baseIdByCode.size !== 5) throw new Error(`Expected 5 bases, found ${baseIdByCode.size}. Run npm run seed.`);

  for (const spec of ordered) {
    await ensureAssignment(admin, userIdByLogin.get(spec.login)!, spec, employeeIdByLogin, baseIdByCode, today);
  }

  for (const userId of userIdByLogin.values()) {
    await ensureRotationTemplate(userId, today);
  }

  await ensureCustomersAndContracts(admin);
  await ensureFilledCertificates(admin, [...userIdByLogin.values()], today);

  const report = await verifyDemoData(roster.map((r) => r.login));
  console.log(JSON.stringify({ password: DEMO_PASSWORD, report }, null, 2));
  console.log(`Demo seed complete: ${roster.length} employees`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
