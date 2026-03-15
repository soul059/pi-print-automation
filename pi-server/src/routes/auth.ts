import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { OAuth2Client } from 'google-auth-library';
import { validateEmail } from '../services/policy';
import { generateOtp, sendOtp, verifyOtp } from '../services/email';
import { generateToken, generateRefreshToken, validateRefreshToken, revokeRefreshToken } from '../middleware/auth';
import { env } from '../config/env';
import { z } from 'zod';
import { logger } from '../config/logger';

export const authRouter = Router();

// Rate limiters for OTP endpoints
const otpSendLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 OTP requests per email per window
  keyGenerator: (req) => req.body?.email || req.ip || 'unknown',
  message: { error: 'Too many OTP requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

const otpVerifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10, // 10 verification attempts per IP per window
  message: { error: 'Too many verification attempts, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Google OAuth client (lazy-initialized)
let googleClient: OAuth2Client | null = null;
function getGoogleClient(): OAuth2Client {
  if (!googleClient) {
    googleClient = new OAuth2Client(env.GOOGLE_CLIENT_ID);
  }
  return googleClient;
}

// --- Google Sign-In ---

authRouter.post('/google', async (req: Request, res: Response) => {
  const { credential } = req.body;
  if (!credential) {
    res.status(400).json({ error: 'Missing Google credential token' });
    return;
  }

  if (!env.GOOGLE_CLIENT_ID) {
    res.status(500).json({ error: 'Google Sign-In not configured on server' });
    return;
  }

  try {
    const client = getGoogleClient();
    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    if (!payload || !payload.email || !payload.email_verified) {
      res.status(401).json({ error: 'Invalid or unverified Google account' });
      return;
    }

    const email = payload.email.toLowerCase();
    const name = payload.name || email.split('@')[0];

    // Validate email against policies
    const policyResult = validateEmail(email);
    if (!policyResult.valid) {
      res.status(403).json({
        error: 'Email not authorized',
        reason: policyResult.reason,
        email,
      });
      return;
    }

    const token = generateToken(email, name);
    const { refreshToken, expiresAt } = generateRefreshToken(email, name);
    logger.info({ email, method: 'google' }, 'User authenticated via Google');

    res.json({
      token,
      refreshToken,
      refreshTokenExpiresAt: expiresAt.toISOString(),
      email,
      name,
      department: policyResult.department,
      year: policyResult.year,
      picture: payload.picture || null,
    });
  } catch (err: any) {
    logger.error({ err: err.message }, 'Google auth verification failed');
    res.status(401).json({ error: 'Google authentication failed' });
  }
});

// --- OTP Flow (fallback) ---

const validateEmailSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(100),
});

const verifyOtpSchema = z.object({
  email: z.string().email(),
  otp: z.string().length(6),
  name: z.string().min(1).max(100),
});

authRouter.post('/validate-email', otpSendLimiter, async (req: Request, res: Response) => {
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

authRouter.post('/verify-otp', otpVerifyLimiter, (req: Request, res: Response) => {
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

  // Re-check email policy (may have been revoked between OTP send and verify)
  const policyResult = validateEmail(email);
  if (!policyResult.valid) {
    res.status(403).json({ verified: false, reason: 'Email no longer authorized' });
    return;
  }

  const token = generateToken(email, name);
  const { refreshToken, expiresAt } = generateRefreshToken(email, name);
  res.json({ verified: true, token, refreshToken, refreshTokenExpiresAt: expiresAt.toISOString() });
});

// --- Token Refresh ---

const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { error: 'Too many refresh requests' },
  standardHeaders: true,
  legacyHeaders: false,
});

authRouter.post('/refresh', refreshLimiter, (req: Request, res: Response) => {
  const { refreshToken } = req.body;
  if (!refreshToken || typeof refreshToken !== 'string') {
    res.status(400).json({ error: 'refreshToken is required' });
    return;
  }

  const user = validateRefreshToken(refreshToken);
  if (!user) {
    res.status(401).json({ error: 'Invalid or expired refresh token. Please log in again.' });
    return;
  }

  // Rotate: revoke old token and issue a new one
  revokeRefreshToken(refreshToken);
  const { refreshToken: newRefreshToken } = generateRefreshToken(user.email, user.name);

  const newAccessToken = generateToken(user.email, user.name);
  logger.info({ email: user.email }, 'Token refreshed with rotation');

  res.json({
    token: newAccessToken,
    refreshToken: newRefreshToken,
    email: user.email,
    name: user.name,
  });
});

// --- Logout (revoke refresh token) ---

authRouter.post('/logout', (req: Request, res: Response) => {
  const { refreshToken } = req.body;
  if (refreshToken && typeof refreshToken === 'string') {
    revokeRefreshToken(refreshToken);
  }
  res.json({ success: true });
});
