import { Router, Response } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { checkLimit } from '../services/limits';
import { getDb } from '../db/connection';

export const userRouter = Router();

userRouter.get('/limit', requireAuth, (req: AuthRequest, res: Response) => {
  try {
    const result = checkLimit(req.userEmail!);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to check limit' });
  }
});

// Notification preferences
userRouter.get('/notifications', requireAuth, (req: AuthRequest, res: Response) => {
  const db = getDb();
  const prefs = db.prepare('SELECT * FROM notification_preferences WHERE user_email = ?').get(req.userEmail!) as any;
  res.json({
    emailOnCompleted: prefs ? prefs.email_on_completed === 1 : true,
    emailOnFailed: prefs ? prefs.email_on_failed === 1 : true,
  });
});

userRouter.put('/notifications', requireAuth, (req: AuthRequest, res: Response) => {
  const { emailOnCompleted, emailOnFailed } = req.body;
  const db = getDb();
  const existing = db.prepare('SELECT * FROM notification_preferences WHERE user_email = ?').get(req.userEmail!) as any;

  if (existing) {
    db.prepare(
      "UPDATE notification_preferences SET email_on_completed = ?, email_on_failed = ?, updated_at = datetime('now') WHERE user_email = ?"
    ).run(emailOnCompleted ? 1 : 0, emailOnFailed ? 1 : 0, req.userEmail!);
  } else {
    db.prepare(
      'INSERT INTO notification_preferences (user_email, email_on_completed, email_on_failed) VALUES (?, ?, ?)'
    ).run(req.userEmail!, emailOnCompleted ? 1 : 0, emailOnFailed ? 1 : 0);
  }

  res.json({
    emailOnCompleted: Boolean(emailOnCompleted),
    emailOnFailed: Boolean(emailOnFailed),
  });
});
