import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';

export interface AuthRequest extends Request {
  userEmail?: string;
  userName?: string;
}

export interface AdminRequest extends Request {
  adminId?: number;
  adminUsername?: string;
  adminRole?: string;
}

export function generateToken(email: string, name: string): string {
  return jwt.sign(
    { sub: email, name, email },
    env.JWT_SECRET,
    { expiresIn: env.JWT_EXPIRY as any, issuer: 'pi-print-service' }
  );
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
  // Support legacy static token for scripts/API
  const staticToken = req.headers['x-admin-token'];
  if (staticToken === env.ADMIN_TOKEN) {
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
