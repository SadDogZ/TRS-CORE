import type { User } from '@prisma/client';
import type { MessageDto, Paginated, SendMessageRequest } from '@app/shared';
import { prisma } from '../../core/db.ts';
import { badRequest, forbidden } from '../../core/errors.ts';
import { audit } from '../../core/audit.ts';
import { assertMessageableUser, messageableUserIds, systemRoleCodes } from '../../core/organizationAccess.ts';

function toDto(
  row: {
    id: number;
    subject: string;
    body: string;
    isBroadcast: boolean;
    createdAt: Date;
    sender: { id: number; fullName: string };
  },
  meta: { recipientsCount: number; readCount: number; recipient: { id: number; fullName: string } | null },
): MessageDto {
  return {
    id: row.id,
    subject: row.subject,
    body: row.body,
    isBroadcast: row.isBroadcast,
    createdAt: row.createdAt.toISOString(),
    sender: row.sender,
    recipientsCount: meta.recipientsCount,
    readCount: meta.readCount,
    recipient: meta.recipient,
  };
}

async function resolveRecipients(actor: User, input: SendMessageRequest) {
  const roles = await systemRoleCodes(actor.id);
  const scope = await messageableUserIds(actor);

  if (input.recipient === 'all') {
    if (!roles.includes('ADMIN')) throw forbidden();
    return prisma.user.findMany({
      where: { isActive: true, isDeleted: false, employee: { isNot: null } },
      select: { id: true, fullName: true },
    });
  }

  if (!input.userId) throw badRequest('Ошибка валидации', { userId: 'Выберите получателя' });
  await assertMessageableUser(actor, input.userId);
  void scope;
  const recipient = await prisma.user.findFirst({
    where: { id: input.userId, isActive: true, isDeleted: false },
    select: { id: true, fullName: true },
  });
  if (!recipient) throw badRequest('Ошибка валидации', { userId: 'Получатель не найден' });
  return [recipient];
}

/** Сообщение сохраняется один раз; доставка — через Notification со статусом прочтения. */
export async function send(actor: User & { fullName: string }, input: SendMessageRequest) {
  const recipients = await resolveRecipients(actor, input);
  if (recipients.length === 0) {
    throw badRequest('Ошибка валидации', {
      userId: input.recipient === 'all' ? 'Нет активных пользователей' : 'Получатель не найден',
    });
  }
  const isBroadcast = input.recipient === 'all';
  const roles = await systemRoleCodes(actor.id);

  return prisma.$transaction(async (tx) => {
    const message = await tx.message.create({
      data: { senderId: actor.id, subject: input.subject, body: input.body, isBroadcast },
    });
    await tx.notification.createMany({
      data: recipients.map((recipient) => ({
        userId: recipient.id,
        kind: 'MESSAGE' as const,
        title: `Сообщение от ${actor.fullName}: ${input.subject}`,
        body: input.body,
        messageId: message.id,
        link: '/me/messages',
      })),
    });
    // Копии другим админам без messageId — иначе попадут в «прочитали X из Y».
    if (roles.includes('ADMIN')) {
      const otherAdmins = await tx.user.findMany({
        where: {
          isDeleted: false,
          isActive: true,
          systemRoles: { some: { revokedAt: null, systemRole: { code: 'ADMIN', isActive: true } } },
          id: { notIn: [actor.id, ...recipients.map((recipient) => recipient.id)] },
        },
        select: { id: true },
      });
      if (otherAdmins.length > 0) {
        const to = isBroadcast ? 'всем сотрудникам' : recipients[0].fullName;
        await tx.notification.createMany({
          data: otherAdmins.map((admin) => ({
            userId: admin.id,
            kind: 'MESSAGE' as const,
            title: `${actor.fullName} → ${to}: ${input.subject}`,
            body: input.body,
            link: '/me/messages',
          })),
        });
      }
    }
    await audit(tx, {
      actorId: actor.id,
      action: 'message.send',
      entityType: 'Message',
      entityId: message.id,
      targetUserId: isBroadcast ? null : recipients[0].id,
      diff: {
        subject: { from: null, to: input.subject },
        recipient: {
          from: null,
          to: isBroadcast ? `Все пользователи (${recipients.length})` : recipients[0].fullName,
        },
      },
    });
    return { id: message.id, recipientsCount: recipients.length };
  });
}

export async function recipients(actor: User) {
  const scope = await messageableUserIds(actor);
  return prisma.user.findMany({
    where: {
      isActive: true,
      isDeleted: false,
      ...(scope
        ? { id: { in: scope.filter((id) => id !== actor.id) } }
        : { id: { not: actor.id }, employee: { isNot: null } }),
    },
    select: { id: true, fullName: true, login: true },
    orderBy: { fullName: 'asc' },
  });
}

export async function unreadCount(actor: User) {
  const count = await prisma.notification.count({
    where: { userId: actor.id, kind: 'MESSAGE', readAt: null, dismissedAt: null },
  });
  return { count };
}

export async function historyFor(
  actor: User,
  query: { page: number; pageSize: number; peerId?: number },
): Promise<Paginated<MessageDto>> {
  const roles = await systemRoleCodes(actor.id);
  const isAdmin = roles.includes('ADMIN');

  const where = query.peerId
    ? {
        OR: [
          { senderId: actor.id, isBroadcast: false, deliveries: { some: { userId: query.peerId } } },
          { senderId: query.peerId, deliveries: { some: { userId: actor.id } } },
        ],
      }
    : isAdmin
      ? {}
      : {
          OR: [{ senderId: actor.id }, { deliveries: { some: { userId: actor.id } } }],
        };

  const [rows, total] = await Promise.all([
    prisma.message.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: { sender: { select: { id: true, fullName: true } } },
    }),
    prisma.message.count({ where }),
  ]);

  const ids = rows.map((row) => row.id);
  const [all, read, personal] = await Promise.all([
    prisma.notification.groupBy({ by: ['messageId'], where: { messageId: { in: ids } }, _count: { _all: true } }),
    prisma.notification.groupBy({
      by: ['messageId'],
      where: { messageId: { in: ids }, readAt: { not: null } },
      _count: { _all: true },
    }),
    prisma.notification.findMany({
      where: { messageId: { in: rows.filter((row) => !row.isBroadcast).map((row) => row.id) } },
      select: { messageId: true, user: { select: { id: true, fullName: true } } },
    }),
  ]);
  const countOf = (groups: typeof all, id: number) => groups.find((group) => group.messageId === id)?._count._all ?? 0;

  if (query.peerId) {
    await prisma.notification.updateMany({
      where: {
        userId: actor.id,
        kind: 'MESSAGE',
        messageId: { in: ids },
        readAt: null,
      },
      data: { readAt: new Date() },
    });
  }

  return {
    items: rows.map((row) =>
      toDto(row, {
        recipientsCount: countOf(all, row.id),
        readCount: countOf(read, row.id),
        recipient: row.isBroadcast ? null : (personal.find((item) => item.messageId === row.id)?.user ?? null),
      }),
    ),
    total,
    page: query.page,
    pageSize: query.pageSize,
  };
}

/** Админская история всех сообщений (обратная совместимость `/api/admin/messages`). */
export async function history(query: { page: number; pageSize: number }): Promise<Paginated<MessageDto>> {
  const [rows, total] = await Promise.all([
    prisma.message.findMany({
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: { sender: { select: { id: true, fullName: true } } },
    }),
    prisma.message.count(),
  ]);
  const ids = rows.map((row) => row.id);
  const [all, read, personal] = await Promise.all([
    prisma.notification.groupBy({ by: ['messageId'], where: { messageId: { in: ids } }, _count: { _all: true } }),
    prisma.notification.groupBy({
      by: ['messageId'],
      where: { messageId: { in: ids }, readAt: { not: null } },
      _count: { _all: true },
    }),
    prisma.notification.findMany({
      where: { messageId: { in: rows.filter((row) => !row.isBroadcast).map((row) => row.id) } },
      select: { messageId: true, user: { select: { id: true, fullName: true } } },
    }),
  ]);
  const countOf = (groups: typeof all, id: number) => groups.find((group) => group.messageId === id)?._count._all ?? 0;
  return {
    items: rows.map((row) =>
      toDto(row, {
        recipientsCount: countOf(all, row.id),
        readCount: countOf(read, row.id),
        recipient: row.isBroadcast ? null : (personal.find((item) => item.messageId === row.id)?.user ?? null),
      }),
    ),
    total,
    page: query.page,
    pageSize: query.pageSize,
  };
}
