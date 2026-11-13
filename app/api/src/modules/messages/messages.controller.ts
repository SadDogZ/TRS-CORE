import type { Request, Response } from 'express';
import { currentUser } from '../../core/auth.ts';
import { validQuery } from '../../core/validate.ts';
import * as messages from './messages.service.ts';

export async function send(req: Request, res: Response) {
  res.status(201).json(await messages.send(currentUser(req), req.body));
}

export async function history(req: Request, res: Response) {
  res.json(await messages.history(validQuery(req)));
}

export async function myHistory(req: Request, res: Response) {
  const query = validQuery<{ page: number; pageSize: number; peerId?: number }>(req);
  res.json(await messages.historyFor(currentUser(req), query));
}

export async function recipients(req: Request, res: Response) {
  res.json(await messages.recipients(currentUser(req)));
}

export async function unreadCount(req: Request, res: Response) {
  res.json(await messages.unreadCount(currentUser(req)));
}
