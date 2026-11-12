// Non-destructive backfill: sets EmployeeAssignment.managerId only for the "reliably mappable" subset
// described by report-unmapped-manager-assignments.ts — i.e. active assignments with baseId set and
// exactly one active MANAGER on that base. Ambiguous cases (null base, multiple managers, no manager)
// are left untouched for manual review.
//
// Usage:
//   node --env-file=.env prisma/backfill-manager-assignments.ts            (dry run, prints planned changes)
//   node --env-file=.env prisma/backfill-manager-assignments.ts --apply    (applies changes in a transaction)

import { prisma } from '../src/core/db.ts';

const apply = process.argv.includes('--apply');

type CandidateManager = { employeeId: number; fullName: string; login: string };

async function main() {
  const missing = await prisma.employeeAssignment.findMany({
    where: { activeEmployeeId: { not: null }, managerId: null },
    include: {
      employee: { include: { user: { select: { fullName: true, login: true, isDeleted: true, isActive: true } } } },
      base: { select: { id: true, name: true } },
    },
    orderBy: [{ baseId: 'asc' }, { startsAt: 'asc' }],
  });

  const managers = await prisma.employeeAssignment.findMany({
    where: {
      activeEmployeeId: { not: null },
      employee: {
        user: {
          isDeleted: false,
          isActive: true,
          systemRoles: { some: { revokedAt: null, systemRole: { code: 'MANAGER', isActive: true } } },
        },
      },
    },
    include: { employee: { include: { user: { select: { fullName: true, login: true } } } } },
  });

  const managerByBase = new Map<number, CandidateManager[]>();
  for (const row of managers) {
    if (row.baseId === null) continue;
    const list = managerByBase.get(row.baseId) ?? [];
    list.push({ employeeId: row.employeeId, fullName: row.employee.user.fullName, login: row.employee.user.login });
    managerByBase.set(row.baseId, list);
  }

  const plan: Array<{ assignmentId: number; employeeId: number; employeeName: string; baseId: number; baseName: string | null; managerId: number; managerName: string }> = [];

  for (const row of missing) {
    if (row.employee.user.isDeleted || !row.employee.user.isActive) continue;
    if (row.baseId === null) continue;
    const candidates = managerByBase.get(row.baseId) ?? [];
    if (candidates.length !== 1) continue;
    const manager = candidates[0];
    if (manager.employeeId === row.employeeId) continue;
    plan.push({
      assignmentId: row.id,
      employeeId: row.employeeId,
      employeeName: row.employee.user.fullName,
      baseId: row.baseId,
      baseName: row.base?.name ?? null,
      managerId: manager.employeeId,
      managerName: manager.fullName,
    });
  }

  console.log(`Plan: ${plan.length} assignment(s) will receive managerId.`);
  for (const item of plan) {
    console.log(`  assignment #${item.assignmentId} · ${item.employeeName} (база ${item.baseName ?? item.baseId}) → менеджер ${item.managerName} [employee #${item.managerId}]`);
  }

  if (!apply) {
    console.log('\nDry run only. Re-run with --apply to write changes.');
    return;
  }
  if (plan.length === 0) {
    console.log('Nothing to apply.');
    return;
  }

  await prisma.$transaction(async (tx) => {
    for (const item of plan) {
      await tx.employeeAssignment.update({ where: { id: item.assignmentId }, data: { managerId: item.managerId } });
    }
  });
  console.log(`Applied managerId to ${plan.length} assignment(s).`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
