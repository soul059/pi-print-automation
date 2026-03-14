import { Router, Request, Response } from 'express';
import { getDb } from '../db/connection';

export const announcementsRouter = Router();

// Public: get the latest active announcement
announcementsRouter.get('/', (_req: Request, res: Response) => {
  try {
    const db = getDb();
    const announcement = db
      .prepare('SELECT id, message, type, created_at, updated_at FROM announcements WHERE active = 1 ORDER BY id DESC LIMIT 1')
      .get() as any;
    res.json({ announcement: announcement || null });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch announcement' });
  }
});
