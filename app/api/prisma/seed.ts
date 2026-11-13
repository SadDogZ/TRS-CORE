/**
 * Стандартный development seed: каталог организации, справочник удостоверений и администратор.
 * Демо-персонал и договоры — отдельно: npm run seed:demo
 */
import { hashPassword } from '../src/core/password.ts';
import { prisma } from '../src/core/db.ts';
import { ensureEmployeeAndLegacyRole, initializeOrganizationCatalog } from '../src/modules/organization/organization.service.ts';

const CATALOG = [
  { name: 'Удостоверение по охране труда', validityMonths: 36, sortOrder: 1 },
  { name: 'Удостоверение по электробезопасности', validityMonths: 12, sortOrder: 2 },
  { name: 'Удостоверение по пожарной безопасности', validityMonths: 36, sortOrder: 3 },
  { name: 'Медицинское заключение', validityMonths: 12, sortOrder: 4 },
  { name: 'Допуск к работам на высоте', validityMonths: 12, sortOrder: 5 },
] as const;

async function main() {
  await initializeOrganizationCatalog();

  const adminPosition = await prisma.position.upsert({
    where: { name: 'Administrator' },
    update: { systemRole: { connect: { code: 'ADMIN' } }, isArchived: false },
    create: { name: 'Administrator', sortOrder: 0, systemRole: { connect: { code: 'ADMIN' } } },
  });

  const login = process.env.SEED_ADMIN_LOGIN ?? 'admin';
  const password = process.env.SEED_ADMIN_PASSWORD ?? 'admin123';

  let admin = await prisma.user.findUnique({ where: { login } });
  if (!admin) {
    await prisma.user.create({
      data: {
        fullName: 'Administrator',
        login,
        passwordHash: await hashPassword(password),
        positionId: adminPosition.id,
        mustChangePassword: true,
        phone: '+7 (900) 100-00-01',
        email: 'admin@trs-core.local',
      },
    });
    console.log('Created administrator: ' + login);
  }
  admin = await prisma.user.findUniqueOrThrow({ where: { login } });
  if (admin.positionId !== adminPosition.id) {
    admin = await prisma.user.update({ where: { id: admin.id }, data: { positionId: adminPosition.id } });
    const employee = await prisma.employee.findUnique({ where: { userId: admin.id } });
    if (employee) {
      await prisma.employeeAssignment.updateMany({
        where: { employeeId: employee.id, activeEmployeeId: employee.id },
        data: { positionId: adminPosition.id },
      });
    }
  }
  await prisma.$transaction((tx) => ensureEmployeeAndLegacyRole(tx, admin!));

  for (const item of CATALOG) {
    const existing = await prisma.credential.findFirst({ where: { name: item.name } });
    if (existing) {
      await prisma.credential.update({
        where: { id: existing.id },
        data: { validityMonths: item.validityMonths, sortOrder: item.sortOrder, isArchived: false },
      });
    } else {
      await prisma.credential.create({ data: { ...item } });
    }
  }

  const bases = await prisma.base.findMany({
    where: { code: { in: ['NZV_BPO', 'ASTR_BPO', 'USI_BPO', 'NUR_BPO', 'YSH_BPO'] } },
    orderBy: { name: 'asc' },
  });
  console.log(`Catalog ready: ${bases.length} target bases, ${CATALOG.length} credential types`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
