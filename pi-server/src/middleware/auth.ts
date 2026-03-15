import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { env } from '../config/env';
import { getDb } from '../db/connection';

export interface AuthRequest extends Request {
  userEmail?: string;
  userName?: string;
}

export interface AdminRequest extends Request {
  adminId?: number;
  adminUsername?: string;
  adminRole?: string;
}

// Short-lived access token (1 hour by default)
export function generateToken(email: string, name: string): string {
  return jwt.sign(
    { sub: email, name, email, type: 'access' },
    env.JWT_SECRET,
    { expiresIn: env.JWT_EXPIRY as any, issuer: 'pi-print-service' }
  );
}

// Long-lived refresh token (30 days by default, stored hashed in DB)
export function generateRefreshToken(email: string, name: string): { refreshToken: string; expiresAt: Date } {
  const db = getDb();
  const rawToken = crypto.randomBytes(48).toString('base64url');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const expiresAt = new Date(Date.now() + env.REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

  db.prepare(
    `INSERT INTO refresh_tokens (token_hash, user_email, user_name, expires_at) VALUES (?, ?, ?, ?)`
  ).run(tokenHash, email, name, expiresAt.toISOString());

  return { refreshToken: rawToken, expiresAt };
}

// Validate and consume a refresh token → returns user info or null
export function validateRefreshToken(rawToken: string): { email: string; name: string } | null {
  const db = getDb();
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

  const row = db.prepare(
    `SELECT * FROM refresh_tokens WHERE token_hash = ? AND revoked = 0`
  ).get(tokenHash) as any;

  if (!row) return null;
  if (new Date(row.expires_at) < new Date()) {
    // Expired — clean up
    db.prepare('DELETE FROM refresh_tokens WHERE id = ?').run(row.id);
    return null;
  }

  // Re-validate email policy on refresh (this is the key security benefit)
  const { validateEmail } = require('../services/policy');
  const policyResult = validateEmail(row.user_email);
  if (!policyResult.valid) {
    // User is no longer authorized — revoke all their tokens
    db.prepare('UPDATE refresh_tokens SET revoked = 1 WHERE user_email = ?').run(row.user_email);
    return null;
  }

  return { email: row.user_email, name: row.user_name };
}

// Revoke a single refresh token
export function revokeRefreshToken(rawToken: string): boolean {
  const db = getDb();
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const result = db.prepare('UPDATE refresh_tokens SET revoked = 1 WHERE token_hash = ?').run(tokenHash);
  return (result as any).changes > 0;
}

// Revoke all refresh tokens for a user
export function revokeAllUserTokens(email: string): void {
  const db = getDb();
  db.prepare('UPDATE refresh_tokens SET revoked = 1 WHERE user_email = ?').run(email);
}

// Cleanup expired tokens (called periodically)
export function cleanupExpiredRefreshTokens(): void {
  const db = getDb();
  db.prepare("DELETE FROM refresh_tokens WHERE expires_at < datetime('now') OR revoked = 1").run();
}

export function generateAdminToken(adminId: number, username: string, role: string): string {
  return jwt.sign(
    { sub: `admin:${adminId}`, adminId, username, role },
    env.JWT_SECRET,
    { expiresIn: '24h' as any, issuer: 'pi-print-service' }
  );
}

export function verifyToken(token: string): { email: string; name: string } | null {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET, {
      issuer: 'pi-print-service',
    }) as jwt.JwtPayload & { email: string; name: string };
    return { email: decoded.email, name: decoded.name };
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

export function requireAdmin(req: AdminRequest, res: Response, next: NextFunction): void {
  // Support legacy static token for scripts/API (timing-safe comparison)
  const staticToken = req.headers['x-admin-token'] as string | undefined;
  if (staticToken && env.ADMIN_TOKEN &&
      staticToken.length === env.ADMIN_TOKEN.length &&
      crypto.timingSafeEqual(Buffer.from(staticToken), Buffer.from(env.ADMIN_TOKEN))) {
    req.adminUsername = 'static-token';
    req.adminRole = 'admin';
    next();
    return;
  }

  // JWT-based admin auth
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Admin authentication required' });
    return;
  }

  try {
    const token = authHeader.slice(7);
    const decoded = jwt.verify(token, env.JWT_SECRET, {
      issuer: 'pi-print-service',
    }) as jwt.JwtPayload & { adminId: number; username: string; role: string };

    if (!decoded.role || decoded.role !== 'admin') {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }

    req.adminId = decoded.adminId;
    req.adminUsername = decoded.username;
    req.adminRole = decoded.role;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired admin token' });
  }
}
