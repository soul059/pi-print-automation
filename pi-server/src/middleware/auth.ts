import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';

export interface AuthRequest extends Request {
  userEmail?: string;
  userName?: string;
}

export function generateToken(email: string, name: string): string {
  return jwt.sign(
    { sub: email, name, email },
    env.JWT_SECRET,
    { expiresIn: env.JWT_EXPIRY as any, issuer: 'pi-print-service' }
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

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const token = req.headers['x-admin-token'];
  if (token !== env.ADMIN_TOKEN) {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }
  next();
}
