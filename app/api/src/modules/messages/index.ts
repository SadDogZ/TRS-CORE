import { Router } from 'express';
import { paginationQuerySchema, sendMessageSchema, object, optional, int } from '@app/shared';
import { asyncHandler as h } from '../../core/asyncHandler.ts';
import { adminOnly, deprecateTo, signedIn, type AppModule } from '../../core/module.ts';
import { validate } from '../../core/validate.ts';
import * as controller from './messages.controller.ts';

const mailboxQuerySchema = object({
  page: int({ min: 1, default: 1 }),
  pageSize: int({ min: 1, max: 100, default: 30 }),
  peerId: optional(int({ min: 1 })),
});

/** Рабочий ящик: любой вошедший в своей зоне. */
const me = Router();
me.use(...signedIn);
me.get('/recipients', h(controller.recipients));
me.get('/unread-count', h(controller.unreadCount));
me.get('/', validate(mailboxQuerySchema, 'query'), h(controller.myHistory));
me.post('/', validate(sendMessageSchema), h(controller.send));

/** Админский ящик (broadcast + полная история). */
const admin = Router();
admin.use(...adminOnly);
admin.use(deprecateTo('/api/me/messages'));
admin.get('/', validate(paginationQuerySchema, 'query'), h(controller.history));
admin.post('/', validate(sendMessageSchema), h(controller.send));

export const messagesModule: AppModule = {
  name: 'messages',
  routes: [
    { path: '/api/me/messages', router: me },
    { path: '/api/admin/messages', router: admin },
  ],
};
