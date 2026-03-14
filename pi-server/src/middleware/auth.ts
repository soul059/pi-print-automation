import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { env } from '../config/env';

export interface AuthRequest extends Request {
  userEmail?: string;
  userName?: string;
}

// Simple JWT-like token (HMAC-based session token)
export function generateToken(email: string, name: string): string {
  const payload = JSON.stringify({ email, name, iat: Date.now() });
  const encoded = Buffer.from(payload).toString('base64url');
  const signature = crypto
    .createHmac('sha256', env.JWT_SECRET)
    .update(encoded)
    .digest('base64url');
  return `${encoded}.${signature}`;
}

export function verifyToken(token: string): { email: string; name: string } | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;

  const [encoded, signature] = parts;
  const expectedSig = crypto
    .createHmac('sha256', env.JWT_SECRET)
    .update(encoded)
    .digest('base64url');

  if (signature !== expectedSig) return null;

  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString());
    return { email: payload.email, name: payload.name };
  } catch {
    return null;
  }
}

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const token = authHeader.slice(7);
  const user = verifyToken(token);
  if (!user) {
    res.status(401).json({ error: 'Invalid or expired token' });
    return;
  }

  req.userEmail = user.email;
  req.userName = user.name;
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const token = req.headers['x-admin-token'];
  if (token !== env.ADMIN_TOKEN) {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }
  next();
}
