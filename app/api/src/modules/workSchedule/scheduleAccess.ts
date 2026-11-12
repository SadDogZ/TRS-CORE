import type { User } from '@prisma/client';
import { forbidden } from '../../core/errors.ts';
import { prisma } from '../../core/db.ts';
import { manageableUserIds, systemRoleCodes } from '../../core/organizationAccess.ts';

const EDITORS = ['ADMIN', 'MANAGER', 'COORDINATOR'];

/** null means every active user. A list is the caller's authorized workspace. */
export async function visibleScheduleUserIds(actor: User): Promise<number[] | null> {
  const roles = await systemRoleCodes(actor.id);
  if (roles.includes('ADMIN')) return null;
  if (roles.includes('MANAGER') || roles.includes('COORDINATOR')) return manageableUserIds(actor);
  return [actor.id];
}

export async function assertCanReadSchedule(actor: User, userId: number) {
  if (userId === actor.id) return;
  const visible = await visibleScheduleUserIds(actor);
  if (visible === null) return;
  if (!visible.includes(userId)) throw forbidden();
}

export async function assertCanEditSchedule(actor: User, userId: number) {
  const roles = await systemRoleCodes(actor.id);
  if (!roles.some((role) => EDITORS.includes(role))) throw forbidden();
  if (roles.includes('ADMIN')) return;
  const visible = await manageableUserIds(actor);
  if (!visible.includes(userId)) throw forbidden();
}

export async function scheduleUsers(ids: number[] | null) {
  return prisma.user.findMany({
    where: { isDeleted: false, isActive: true, ...(ids ? { id: { in: ids } } : {}) },
    select: { id: true, fullName: true, login: true },
    orderBy: { fullName: 'asc' },
  });
}
