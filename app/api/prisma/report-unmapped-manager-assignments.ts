import { prisma } from '../src/core/db.ts';

type MissingAssignment = {
  employeeId: number;
  fullName: string;
  login: string;
  baseId: number | null;
  baseName: string | null;
  startsAt: string;
  track: string;
};

type CandidateManager = {
  employeeId: number;
  userId: number;
  fullName: string;
  login: string;
  baseId: number | null;
};

async function main() {
  const missing = await prisma.employeeAssignment.findMany({
    where: { activeEmployeeId: { not: null }, managerId: null },
    include: {
      employee: {
        include: {
          user: { select: { id: true, fullName: true, login: true, isDeleted: true, isActive: true } },
        },
      },
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
          systemRoles: {
            some: { revokedAt: null, systemRole: { code: 'MANAGER', isActive: true } },
          },
        },
      },
    },
    include: {
      employee: { include: { user: { select: { id: true, fullName: true, login: true } } } },
    },
  });

  const managerByBase = new Map<number, CandidateManager[]>();
  for (const row of managers) {
    if (row.baseId === null) continue;
    const list = managerByBase.get(row.baseId) ?? [];
    list.push({
      employeeId: row.employeeId,
      userId: row.employee.user.id,
      fullName: row.employee.user.fullName,
      login: row.employee.user.login,
      baseId: row.baseId,
    });
    managerByBase.set(row.baseId, list);
  }

  const unresolved: Array<MissingAssignment & { reason: string; managerCandidates: CandidateManager[] }> = [];
  const reliablyMappable: Array<MissingAssignment & { manager: CandidateManager }> = [];

  for (const row of missing) {
    if (row.employee.user.isDeleted || !row.employee.user.isActive) continue;
    const item: MissingAssignment = {
      employeeId: row.employeeId,
      fullName: row.employee.user.fullName,
      login: row.employee.user.login,
      baseId: row.baseId,
      baseName: row.base?.name ?? null,
      startsAt: row.startsAt.toISOString().slice(0, 10),
      track: row.track,
    };

    if (row.baseId === null) {
      unresolved.push({
        ...item,
        reason: 'Сотрудник без базы — невозможно однозначно определить ответственного менеджера',
        managerCandidates: [],
      });
      continue;
    }

    const candidates = managerByBase.get(row.baseId) ?? [];
    if (candidates.length === 1 && candidates[0].employeeId === row.employeeId) {
      unresolved.push({
        ...item,
        reason: 'Единственный менеджер базы — сам сотрудник, назначать его ответственным за себя нельзя',
        managerCandidates: [],
      });
      continue;
    }
    if (candidates.length === 1) {
      reliablyMappable.push({ ...item, manager: candidates[0] });
      continue;
    }

    unresolved.push({
      ...item,
      reason: candidates.length === 0
        ? 'На базе нет активного менеджера с системной ролью MANAGER'
        : 'На базе несколько активных менеджеров — неоднозначное соответствие',
      managerCandidates: candidates,
    });
  }

  const report = {
    generatedAt: new Date().toISOString(),
    totals: {
      missingActiveAssignments: missing.length,
      reliablyMappable: reliablyMappable.length,
      unresolved: unresolved.length,
    },
    reliablyMappable,
    unresolved,
  };

  console.log(JSON.stringify(report, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
