import { Router, Response } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { checkLimit } from '../services/limits';

export const userRouter = Router();

userRouter.get('/limit', requireAuth, (req: AuthRequest, res: Response) => {
  try {
    const result = checkLimit(req.userEmail!);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to check limit' });
  }
});
