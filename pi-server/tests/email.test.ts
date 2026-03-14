import { describe, it, expect } from 'vitest';

// Email validation tests (mock DB policies)
// These test the regex patterns used in the policy service

describe('Email Pattern Matching', () => {
  const policies = [
    { pattern: '^[0-9]{2}itub[0-9]{3}$', department: 'IT Undergraduate B' },
    { pattern: '^[0-9]{2}csub[0-9]{3}$', department: 'CS Undergraduate B' },
    { pattern: '^[0-9]{2}ecub[0-9]{3}$', department: 'EC Undergraduate B' },
  ];

  function matchPolicy(localPart: string): string | null {
    for (const p of policies) {
      if (new RegExp(p.pattern).test(localPart)) return p.department;
    }
    return null;
  }

  it('matches valid IT email', () => {
    expect(matchPolicy('23itub017')).toBe('IT Undergraduate B');
  });

  it('matches valid CS email', () => {
    expect(matchPolicy('22csub042')).toBe('CS Undergraduate B');
  });

  it('matches valid EC email', () => {
    expect(matchPolicy('24ecub001')).toBe('EC Undergraduate B');
  });

  it('rejects unknown department', () => {
    expect(matchPolicy('23meub017')).toBeNull();
  });

  it('rejects invalid format', () => {
    expect(matchPolicy('admin')).toBeNull();
    expect(matchPolicy('test@test.com')).toBeNull();
  });

  it('rejects partial matches', () => {
    expect(matchPolicy('23itub')).toBeNull(); // missing roll number
    expect(matchPolicy('itub017')).toBeNull(); // missing year
  });
});
