import { getDb } from '../db/connection';
import { logger } from '../config/logger';

// Simple ReDoS detection: reject patterns with nested quantifiers
export function isSafeRegex(pattern: string): boolean {
  // Reject nested quantifiers like (a+)+, (a*)+, (a{1,})*
  if (/(\+|\*|\{)\)?(\+|\*|\{)/.test(pattern)) return false;
  // Reject patterns longer than 200 chars
  if (pattern.length > 200) return false;
  return true;
}

interface EmailPolicy {
  id: number;
  name: string;
  domain: string;
  pattern: string;
  department_key: string;
  active: number;
}

export interface EmailValidationResult {
  valid: boolean;
  reason?: string;
  department?: string;
  departmentKey?: string;
  year?: string;
}

export function validateEmail(email: string): EmailValidationResult {
  const db = getDb();

  const atIndex = email.indexOf('@');
  if (atIndex === -1) {
    return { valid: false, reason: 'Invalid email format' };
  }

  const localPart = email.slice(0, atIndex).toLowerCase();
  const domain = email.slice(atIndex + 1).toLowerCase();

  const policies = db
    .prepare('SELECT * FROM email_policies WHERE domain = ? AND active = 1')
    .all(domain) as EmailPolicy[];

  if (policies.length === 0) {
    return { valid: false, reason: `Domain "${domain}" is not allowed` };
  }

  for (const policy of policies) {
    try {
      if (!isSafeRegex(policy.pattern)) {
        logger.warn({ policy: policy.name, pattern: policy.pattern }, 'Unsafe regex pattern skipped');
        continue;
      }
      const regex = new RegExp(policy.pattern);
      if (regex.test(localPart)) {
        // Extract year from first 2 digits if present
        const yearMatch = localPart.match(/^(\d{2})/);
        const year = yearMatch ? `20${yearMatch[1]}` : undefined;

        return {
          valid: true,
          department: policy.name,
          departmentKey: policy.department_key,
          year,
        };
      }
    } catch (err: any) {
      logger.warn({ policy: policy.name, pattern: policy.pattern }, 'Invalid regex in policy');
    }
  }

  return { valid: false, reason: 'Email does not match any allowed department' };
}

// Admin CRUD operations
export function getAllPolicies(): EmailPolicy[] {
  const db = getDb();
  return db.prepare('SELECT * FROM email_policies ORDER BY created_at DESC').all() as EmailPolicy[];
}

export function createPolicy(data: {
  name: string;
  domain: string;
  pattern: string;
  departmentKey: string;
  active?: boolean;
}): EmailPolicy {
  // Validate regex is syntactically valid and safe from ReDoS
  try {
    new RegExp(data.pattern);
  } catch {
    throw new Error(`Invalid regex pattern: ${data.pattern}`);
  }
  if (!isSafeRegex(data.pattern)) {
    throw new Error('Regex pattern rejected: potential ReDoS risk (nested quantifiers or excessive length)');
  }
  const db = getDb();
  const result = db
    .prepare(
      'INSERT INTO email_policies (name, domain, pattern, department_key, active) VALUES (?, ?, ?, ?, ?)'
    )
    .run(data.name, data.domain, data.pattern, data.departmentKey, data.active !== false ? 1 : 0);

  return db.prepare('SELECT * FROM email_policies WHERE id = ?').get(result.lastInsertRowid) as EmailPolicy;
}

export function updatePolicy(
  id: number,
  data: Partial<{ name: string; domain: string; pattern: string; departmentKey: string; active: boolean }>
): EmailPolicy | null {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM email_policies WHERE id = ?').get(id) as EmailPolicy | undefined;
  if (!existing) return null;

  db.prepare(
    `UPDATE email_policies SET 
      name = COALESCE(?, name),
      domain = COALESCE(?, domain),
      pattern = COALESCE(?, pattern),
      department_key = COALESCE(?, department_key),
      active = COALESCE(?, active),
      updated_at = datetime('now')
    WHERE id = ?`
  ).run(
    data.name ?? null,
    data.domain ?? null,
    data.pattern ?? null,
    data.departmentKey ?? null,
    data.active !== undefined ? (data.active ? 1 : 0) : null,
    id
  );

  return db.prepare('SELECT * FROM email_policies WHERE id = ?').get(id) as EmailPolicy;
}

export function deletePolicy(id: number): boolean {
  const db = getDb();
  const result = db.prepare('DELETE FROM email_policies WHERE id = ?').run(id);
  return result.changes > 0;
}
