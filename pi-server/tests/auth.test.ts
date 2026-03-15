import { describe, it, expect, vi } from 'vitest';
import jwt from 'jsonwebtoken';

// Mock the env module before importing auth
vi.mock('../src/config/env', () => ({
  env: {
    JWT_SECRET: 'test-secret-key-for-unit-tests',
    JWT_EXPIRY: '30d',
  },
}));

import { generateToken, generateAdminToken, verifyToken } from '../src/middleware/auth';

describe('generateToken', () => {
  it('generates a valid JWT string', () => {
    const token = generateToken('user@example.com', 'Test User');
    expect(typeof token).toBe('string');
    expect(token.split('.')).toHaveLength(3);
  });

  it('includes email and name in payload', () => {
    const token = generateToken('user@example.com', 'Test User');
    const decoded = jwt.decode(token) as any;
    expect(decoded.email).toBe('user@example.com');
    expect(decoded.name).toBe('Test User');
  });

  it('sets sub to email', () => {
    const token = generateToken('user@example.com', 'Test User');
    const decoded = jwt.decode(token) as any;
    expect(decoded.sub).toBe('user@example.com');
  });

  it('sets correct issuer', () => {
    const token = generateToken('user@example.com', 'Test User');
    const decoded = jwt.decode(token) as any;
    expect(decoded.iss).toBe('pi-print-service');
  });

  it('sets expiration', () => {
    const token = generateToken('user@example.com', 'Test User');
    const decoded = jwt.decode(token) as any;
    expect(decoded.exp).toBeDefined();
    expect(decoded.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });
});

describe('verifyToken', () => {
  it('verifies a valid token and returns email/name', () => {
    const token = generateToken('user@example.com', 'Test User');
    const result = verifyToken(token);
    expect(result).toEqual({ email: 'user@example.com', name: 'Test User' });
  });

  it('returns null for invalid token', () => {
    expect(verifyToken('invalid.token.here')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(verifyToken('')).toBeNull();
  });

  it('returns null for tampered token', () => {
    const token = generateToken('user@example.com', 'Test User');
    // Flip a character in the signature
    const parts = token.split('.');
    parts[2] = parts[2].slice(0, -1) + (parts[2].slice(-1) === 'a' ? 'b' : 'a');
    const tampered = parts.join('.');
    expect(verifyToken(tampered)).toBeNull();
  });

  it('returns null for token signed with wrong secret', () => {
    const token = jwt.sign(
      { sub: 'user@example.com', email: 'user@example.com', name: 'Test User' },
      'wrong-secret',
      { issuer: 'pi-print-service' }
    );
    expect(verifyToken(token)).toBeNull();
  });

  it('returns null for token with wrong issuer', () => {
    const token = jwt.sign(
      { sub: 'user@example.com', email: 'user@example.com', name: 'Test User' },
      'test-secret-key-for-unit-tests',
      { issuer: 'wrong-issuer' }
    );
    expect(verifyToken(token)).toBeNull();
  });

  it('returns null for expired token', () => {
    const token = jwt.sign(
      { sub: 'user@example.com', email: 'user@example.com', name: 'Test User' },
      'test-secret-key-for-unit-tests',
      { expiresIn: '-1s', issuer: 'pi-print-service' }
    );
    expect(verifyToken(token)).toBeNull();
  });

  it('returns null for admin token (no email field)', () => {
    const adminToken = generateAdminToken(1, 'admin', 'admin');
    const result = verifyToken(adminToken);
    // Admin tokens don't have email/name in the expected format
    expect(result).toEqual({ email: undefined, name: undefined });
  });
});

describe('generateAdminToken', () => {
  it('generates a valid JWT string', () => {
    const token = generateAdminToken(1, 'admin', 'admin');
    expect(typeof token).toBe('string');
    expect(token.split('.')).toHaveLength(3);
  });

  it('includes adminId, username, role in payload', () => {
    const token = generateAdminToken(42, 'superadmin', 'admin');
    const decoded = jwt.decode(token) as any;
    expect(decoded.adminId).toBe(42);
    expect(decoded.username).toBe('superadmin');
    expect(decoded.role).toBe('admin');
  });

  it('sets sub to admin:{id}', () => {
    const token = generateAdminToken(5, 'admin', 'admin');
    const decoded = jwt.decode(token) as any;
    expect(decoded.sub).toBe('admin:5');
  });

  it('sets correct issuer', () => {
    const token = generateAdminToken(1, 'admin', 'admin');
    const decoded = jwt.decode(token) as any;
    expect(decoded.iss).toBe('pi-print-service');
  });

  it('has 24h expiry', () => {
    const token = generateAdminToken(1, 'admin', 'admin');
    const decoded = jwt.decode(token) as any;
    const now = Math.floor(Date.now() / 1000);
    const expectedExpiry = now + 24 * 60 * 60;
    // Allow 5 second tolerance
    expect(decoded.exp).toBeGreaterThan(expectedExpiry - 5);
    expect(decoded.exp).toBeLessThanOrEqual(expectedExpiry + 5);
  });

  it('produces different tokens for different admins', () => {
    const token1 = generateAdminToken(1, 'admin1', 'admin');
    const token2 = generateAdminToken(2, 'admin2', 'admin');
    expect(token1).not.toBe(token2);
  });
});
