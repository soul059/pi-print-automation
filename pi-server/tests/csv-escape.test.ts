import { describe, it, expect } from 'vitest';

// Reimplement escapeCsvField from admin.ts for testing
function escapeCsvField(value: any): string {
  if (value == null) return '';
  const str = String(value);
  const sanitized = /^[=+\-@\t\r]/.test(str) ? `'${str}` : str;
  if (sanitized.includes(',') || sanitized.includes('"') || sanitized.includes('\n')) {
    return `"${sanitized.replace(/"/g, '""')}"`;
  }
  return sanitized;
}

describe('CSV escaping - Normal text', () => {
  it('returns normal text unchanged', () => {
    expect(escapeCsvField('hello')).toBe('hello');
  });

  it('returns single word unchanged', () => {
    expect(escapeCsvField('test')).toBe('test');
  });

  it('returns alphanumeric unchanged', () => {
    expect(escapeCsvField('job123')).toBe('job123');
  });
});

describe('CSV escaping - Commas', () => {
  it('wraps text with comma in quotes', () => {
    expect(escapeCsvField('hello, world')).toBe('"hello, world"');
  });

  it('wraps text ending with comma', () => {
    expect(escapeCsvField('hello,')).toBe('"hello,"');
  });
});

describe('CSV escaping - Quotes', () => {
  it('doubles and wraps text with quotes', () => {
    expect(escapeCsvField('say "hello"')).toBe('"say ""hello"""');
  });

  it('handles single double quote', () => {
    expect(escapeCsvField('"')).toBe('""""');
  });

  it('handles multiple quotes', () => {
    expect(escapeCsvField('""')).toBe('""""""');
  });
});

describe('CSV escaping - Newlines', () => {
  it('wraps text with newline', () => {
    expect(escapeCsvField('line1\nline2')).toBe('"line1\nline2"');
  });
});

describe('CSV escaping - Formula Injection Prevention', () => {
  it('prefixes = with quote', () => {
    expect(escapeCsvField('=cmd|calc|1')).toBe("'=cmd|calc|1");
  });

  it('prefixes + with quote', () => {
    expect(escapeCsvField('+cmd')).toBe("'+cmd");
  });

  it('prefixes - with quote', () => {
    expect(escapeCsvField('-cmd')).toBe("'-cmd");
  });

  it('prefixes @ with quote', () => {
    expect(escapeCsvField('@SUM(A1)')).toBe("'@SUM(A1)");
  });

  it('prefixes tab with quote', () => {
    expect(escapeCsvField('\tcmd')).toBe("'\tcmd");
  });

  it('prefixes carriage return with quote', () => {
    expect(escapeCsvField('\rcmd')).toBe("'\rcmd");
  });

  it('does not prefix safe text starting with letters', () => {
    expect(escapeCsvField('hello')).toBe('hello');
  });

  it('does not prefix numbers', () => {
    expect(escapeCsvField('123')).toBe('123');
  });

  it('handles injection + comma combo', () => {
    // =cmd with comma → prefix ' then wrap in quotes
    expect(escapeCsvField('=1,2')).toBe("\"'=1,2\"");
  });

  it('handles injection + quotes combo', () => {
    expect(escapeCsvField('=say"hi"')).toBe("\"'=say\"\"hi\"\"\"");
  });
});

describe('CSV escaping - Null/Undefined', () => {
  it('returns empty for null', () => {
    expect(escapeCsvField(null)).toBe('');
  });

  it('returns empty for undefined', () => {
    expect(escapeCsvField(undefined)).toBe('');
  });
});

describe('CSV escaping - Empty string', () => {
  it('returns empty string', () => {
    expect(escapeCsvField('')).toBe('');
  });
});

describe('CSV escaping - Number coercion', () => {
  it('coerces number to string', () => {
    expect(escapeCsvField(42)).toBe('42');
  });

  it('coerces zero', () => {
    expect(escapeCsvField(0)).toBe('0');
  });

  it('coerces negative number (prefixes with quote)', () => {
    expect(escapeCsvField(-5)).toBe("'-5");
  });

  it('coerces boolean true', () => {
    expect(escapeCsvField(true)).toBe('true');
  });

  it('coerces boolean false', () => {
    expect(escapeCsvField(false)).toBe('false');
  });
});

describe('CSV escaping - Edge cases', () => {
  it('handles string with only comma', () => {
    expect(escapeCsvField(',')).toBe('","');
  });

  it('handles string with only newline', () => {
    expect(escapeCsvField('\n')).toBe('"\n"');
  });

  it('handles long string without special chars', () => {
    const long = 'a'.repeat(1000);
    expect(escapeCsvField(long)).toBe(long);
  });

  it('handles string with all dangerous chars', () => {
    const dangerous = '=cmd,"test"\n';
    const result = escapeCsvField(dangerous);
    expect(result.startsWith('"')).toBe(true);
    expect(result.endsWith('"')).toBe(true);
  });
});
