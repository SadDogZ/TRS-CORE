import { prisma } from '../src/core/db.ts';
import { ALLOWED_POSITIONS, DEMO_CUSTOMERS, ROTATION_TEMPLATE_NAME, buildDemoRoster } from './seed-shared.ts';

async function main() {
  const roster = buildDemoRoster();
  const logins = roster.map((item) => item.login);
  const rows = await prisma.employeeAssignment.findMany({
    where: { activeEmployeeId: { not: null }, employee: { user: { login: { in: logins } } } },
    select: {
      employeeId: true,
      supervisorEmployeeId: true,
      managerId: true,
      baseId: true,
      position: { select: { name: true } },
      employee: { select: { user: { select: { login: true } } } },
    },
  });

  let cycles = 0;
  for (const row of rows) {
    const seen = new Set<number>();
    let cursor = row.supervisorEmployeeId;
    while (cursor != null) {
      if (cursor === row.employeeId) {
        cycles += 1;
        break;
      }
      if (seen.has(cursor)) break;
      seen.add(cursor);
      cursor = rows.find((item) => item.employeeId === cursor)?.supervisorEmployeeId ?? null;
    }
  }

  const schedules = await prisma.scheduleTemplate.count({
    where: { name: ROTATION_TEMPLATE_NAME, isActive: true, user: { login: { in: logins } } },
  });
  const filledCredentials = await prisma.userCredential.count({
    where: { user: { login: { in: logins } }, issueDate: { not: null }, number: { not: null } },
  });
  const customers = await prisma.customer.count({ where: { code: { in: DEMO_CUSTOMERS.map((item) => item.code) } } });
  const contracts = await prisma.contract.count({ where: { customer: { code: { in: DEMO_CUSTOMERS.map((item) => item.code) } } } });
  const addenda = await prisma.contractAddendum.count({
    where: { contract: { customer: { code: { in: DEMO_CUSTOMERS.map((item) => item.code) } } } },
  });
  const foreign = rows.filter((row) => row.position && !ALLOWED_POSITIONS.includes(row.position.name as (typeof ALLOWED_POSITIONS)[number])).length;

  console.log(JSON.stringify({
    assignments: rows.length,
    cycles,
    schedules,
    filledCredentials,
    customers,
    contracts,
    addenda,
    foreignPositions: foreign,
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
