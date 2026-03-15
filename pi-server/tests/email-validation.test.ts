import { describe, it, expect } from 'vitest';

// Test email format validation patterns

// Basic email format check (RFC-lite)
function isValidEmailFormat(email: string): boolean {
  if (!email || typeof email !== 'string') return false;
  const parts = email.split('@');
  if (parts.length !== 2) return false;
  const [local, domain] = parts;
  if (!local || !domain) return false;
  if (domain.indexOf('.') === -1) return false;
  if (local.length > 64) return false;
  if (email.length > 254) return false;
  return true;
}

// Domain matching (case-insensitive)
function matchesDomain(email: string, allowedDomain: string): boolean {
  const domain = email.split('@')[1];
  if (!domain) return false;
  return domain.toLowerCase() === allowedDomain.toLowerCase();
}

// Email masking (from pdf.ts)
function maskEmailAddress(email: string): string {
  const [local, domain] = email.split('@');
  if (local.length <= 3) return `${local[0]}***@${domain}`;
  return `${local.slice(0, 3)}***@${domain}`;
}

describe('Email Format Validation', () => {
  it('accepts valid email', () => {
    expect(isValidEmailFormat('user@example.com')).toBe(true);
  });

  it('accepts email with subdomain', () => {
    expect(isValidEmailFormat('user@mail.example.com')).toBe(true);
  });

  it('accepts email with dots in local part', () => {
    expect(isValidEmailFormat('first.last@example.com')).toBe(true);
  });

  it('accepts email with plus in local part', () => {
    expect(isValidEmailFormat('user+tag@example.com')).toBe(true);
  });

  it('accepts email with numbers', () => {
    expect(isValidEmailFormat('user123@example.com')).toBe(true);
  });

  it('rejects email without @', () => {
    expect(isValidEmailFormat('userexample.com')).toBe(false);
  });

  it('rejects email with multiple @', () => {
    expect(isValidEmailFormat('user@@example.com')).toBe(false);
  });

  it('rejects empty local part', () => {
    expect(isValidEmailFormat('@example.com')).toBe(false);
  });

  it('rejects empty domain', () => {
    expect(isValidEmailFormat('user@')).toBe(false);
  });

  it('rejects domain without dot', () => {
    expect(isValidEmailFormat('user@localhost')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isValidEmailFormat('')).toBe(false);
  });

  it('rejects null/undefined', () => {
    expect(isValidEmailFormat(null as any)).toBe(false);
    expect(isValidEmailFormat(undefined as any)).toBe(false);
  });

  it('rejects very long local part (>64 chars)', () => {
    const longLocal = 'a'.repeat(65);
    expect(isValidEmailFormat(`${longLocal}@example.com`)).toBe(false);
  });

  it('rejects very long email (>254 chars)', () => {
    const longDomain = 'a'.repeat(250) + '.com';
    expect(isValidEmailFormat(`u@${longDomain}`)).toBe(false);
  });

  it('rejects just whitespace', () => {
    expect(isValidEmailFormat('   ')).toBe(false);
  });
});

describe('Domain Matching', () => {
  it('matches exact domain', () => {
    expect(matchesDomain('user@charusat.edu.in', 'charusat.edu.in')).toBe(true);
  });

  it('case-insensitive match', () => {
    expect(matchesDomain('user@CHARUSAT.EDU.IN', 'charusat.edu.in')).toBe(true);
    expect(matchesDomain('user@charusat.edu.in', 'CHARUSAT.EDU.IN')).toBe(true);
  });

  it('rejects different domain', () => {
    expect(matchesDomain('user@gmail.com', 'charusat.edu.in')).toBe(false);
  });

  it('rejects subdomain mismatch', () => {
    expect(matchesDomain('user@sub.charusat.edu.in', 'charusat.edu.in')).toBe(false);
  });

  it('handles missing @ gracefully', () => {
    expect(matchesDomain('nodomain', 'example.com')).toBe(false);
  });
});

describe('Email Masking', () => {
  it('masks email with long local part', () => {
    expect(maskEmailAddress('username@example.com')).toBe('use***@example.com');
  });

  it('masks email with exactly 3-char local part', () => {
    expect(maskEmailAddress('abc@example.com')).toBe('a***@example.com');
  });

  it('masks email with 1-char local part', () => {
    expect(maskEmailAddress('a@example.com')).toBe('a***@example.com');
  });

  it('masks email with 4-char local part', () => {
    expect(maskEmailAddress('abcd@example.com')).toBe('abc***@example.com');
  });

  it('preserves domain', () => {
    const masked = maskEmailAddress('longuser@university.edu.in');
    expect(masked.endsWith('@university.edu.in')).toBe(true);
  });
});

describe('Department Pattern Matching (from email.test.ts extension)', () => {
  const policies = [
    { pattern: '^[0-9]{2}it[a-z]+[0-9]{3}$', department: 'IT Department' },
    { pattern: '^[0-9]{2}cs[a-z]+[0-9]{3}$', department: 'CS Department' },
    { pattern: '^[0-9]{2}ec[a-z]+[0-9]{3}$', department: 'EC Department' },
    { pattern: '^[0-9]{2}ce[a-z]+[0-9]{3}$', department: 'CE Department' },
    { pattern: '^[0-9]{2}me[a-z]+[0-9]{3}$', department: 'ME Department' },
  ];

  function matchPolicy(localPart: string): string | null {
    for (const p of policies) {
      if (new RegExp(p.pattern).test(localPart)) return p.department;
    }
    return null;
  }

  it('matches CE department', () => {
    expect(matchPolicy('23ceub042')).toBe('CE Department');
  });

  it('matches ME department', () => {
    expect(matchPolicy('24meub001')).toBe('ME Department');
  });

  it('matches IT with variable middle (itubs)', () => {
    expect(matchPolicy('23itubs017')).toBe('IT Department');
  });

  it('rejects roll number too short', () => {
    expect(matchPolicy('23it01')).toBeNull();
  });

  it('rejects roll number too long', () => {
    expect(matchPolicy('23itub0170')).toBeNull();
  });

  it('rejects uppercase department code', () => {
    expect(matchPolicy('23ITUB017')).toBeNull();
  });

  it('rejects non-numeric year', () => {
    expect(matchPolicy('ABitub017')).toBeNull();
  });

  it('rejects empty string', () => {
    expect(matchPolicy('')).toBeNull();
  });

  it('rejects SQL injection attempt', () => {
    expect(matchPolicy("' OR 1=1 --")).toBeNull();
  });
});
