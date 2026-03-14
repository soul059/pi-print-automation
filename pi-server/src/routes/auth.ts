import { Router, Request, Response } from 'express';
import { validateEmail } from '../services/policy';
import { generateOtp, sendOtp, verifyOtp } from '../services/email';
import { generateToken } from '../middleware/auth';
import { z } from 'zod';
import { logger } from '../config/logger';

export const authRouter = Router();

const validateEmailSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(100),
});

const verifyOtpSchema = z.object({
  email: z.string().email(),
  otp: z.string().length(6),
  name: z.string().min(1).max(100),
});

authRouter.post('/validate-email', async (req: Request, res: Response) => {
  try {
    const parsed = validateEmailSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ valid: false, reason: 'Invalid request body' });
      return;
    }

    const { email, name } = parsed.data;
    const result = validateEmail(email);

    if (!result.valid) {
      res.status(403).json(result);
      return;
    }

    // Generate and send OTP
    const otp = generateOtp();
    await sendOtp(email, otp);

    res.json({
      valid: true,
      department: result.department,
      year: result.year,
      message: 'OTP sent to email',
    });
  } catch (err: any) {
    logger.error({ err: err.message }, 'Email validation error');
    res.status(500).json({ valid: false, reason: 'Failed to send OTP' });
  }
});

authRouter.post('/verify-otp', (req: Request, res: Response) => {
  const parsed = verifyOtpSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ verified: false, reason: 'Invalid request body' });
    return;
  }

  const { email, otp, name } = parsed.data;
  const verified = verifyOtp(email, otp);

  if (!verified) {
    res.status(400).json({ verified: false, reason: 'Invalid or expired OTP' });
    return;
  }

  const token = generateToken(email, name);
  res.json({ verified: true, token });
});
