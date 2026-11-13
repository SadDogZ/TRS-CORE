import { prisma } from '../src/core/db.ts';

const rows = await prisma.$queryRaw<
  { migration_name: string; finished_at: Date | null; rolled_back_at: Date | null }[]
>`SELECT migration_name, finished_at, rolled_back_at FROM _prisma_migrations ORDER BY started_at`;
console.log(rows);
await prisma.$disconnect();
