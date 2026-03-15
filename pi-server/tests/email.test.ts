import { describe, it, expect } from 'vitest';

// Email validation tests (mock DB policies)
// These test the regex patterns used in the policy service

describe('Email Pattern Matching', () => {
  const policies = [
    { pattern: '^[0-9]{2}it[a-z]+[0-9]{3}$', department: 'IT Department' },
    { pattern: '^[0-9]{2}cs[a-z]+[0-9]{3}$', department: 'CS Department' },
    { pattern: '^[0-9]{2}ec[a-z]+[0-9]{3}$', department: 'EC Department' },
  ];

  function matchPolicy(localPart: string): string | null {
    for (const p of policies) {
      if (new RegExp(p.pattern).test(localPart)) return p.department;
    }
    return null;
  }

  it('matches valid IT email (itub format)', () => {
    expect(matchPolicy('23itub017')).toBe('IT Department');
  });

  it('matches valid IT email (itubs format)', () => {
    expect(matchPolicy('23itubs017')).toBe('IT Department');
  });

  it('matches valid CS email', () => {
    expect(matchPolicy('22csub042')).toBe('CS Department');
  });

  it('matches valid EC email', () => {
    expect(matchPolicy('24ecub001')).toBe('EC Department');
  });

  it('rejects unknown department', () => {
    expect(matchPolicy('23meub017')).toBeNull();
  });

  it('rejects invalid format', () => {
    expect(matchPolicy('admin')).toBeNull();
    expect(matchPolicy('test@test.com')).toBeNull();
  });

  it('rejects partial matches', () => {
    expect(matchPolicy('23it')).toBeNull(); // missing letters+roll
    expect(matchPolicy('itub017')).toBeNull(); // missing year
  });
});
