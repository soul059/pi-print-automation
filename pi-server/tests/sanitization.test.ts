import { describe, it, expect } from 'vitest';

// Reimplement the same regex patterns used in cups.ts sanitize functions
// These are private functions, so we test the validation logic directly

describe('sanitizePageRange', () => {
  const isValid = (v: string) => /^[\d,\- ]+$/.test(v);

  it('accepts single page number', () => {
    expect(isValid('1')).toBe(true);
    expect(isValid('42')).toBe(true);
    expect(isValid('999')).toBe(true);
  });

  it('accepts page range', () => {
    expect(isValid('1-5')).toBe(true);
    expect(isValid('10-20')).toBe(true);
  });

  it('accepts comma-separated pages', () => {
    expect(isValid('1,3,5')).toBe(true);
    expect(isValid('1,2,3,4,5')).toBe(true);
  });

  it('accepts mixed ranges and pages', () => {
    expect(isValid('1-3,5,7-9')).toBe(true);
    expect(isValid('1-5, 8, 10-12')).toBe(true);
  });

  it('accepts spaces', () => {
    expect(isValid('1 - 5')).toBe(true);
    expect(isValid(' 1, 3, 5 ')).toBe(true);
  });

  it('rejects command injection: semicolon', () => {
    expect(isValid('; rm -rf /')).toBe(false);
  });

  it('rejects command injection: $() subshell', () => {
    expect(isValid('$(whoami)')).toBe(false);
  });

  it('rejects command injection: backtick', () => {
    expect(isValid('`id`')).toBe(false);
  });

  it('rejects pipe injection', () => {
    expect(isValid('| cat /etc/passwd')).toBe(false);
  });

  it('rejects angle brackets', () => {
    expect(isValid('<script>')).toBe(false);
    expect(isValid('1>output')).toBe(false);
  });

  it('rejects quotes', () => {
    expect(isValid('"1-5"')).toBe(false);
    expect(isValid("'1-5'")).toBe(false);
  });

  it('rejects newline characters', () => {
    expect(isValid('1\n2')).toBe(false);
  });

  it('rejects null bytes', () => {
    expect(isValid('1\x002')).toBe(false);
  });

  it('rejects letters', () => {
    expect(isValid('abc')).toBe(false);
    expect(isValid('1-5a')).toBe(false);
  });

  it('rejects unicode characters', () => {
    expect(isValid('１-５')).toBe(false);
    expect(isValid('1–5')).toBe(false); // en-dash
  });

  it('rejects empty string', () => {
    expect(isValid('')).toBe(false);
  });
});

describe('sanitizePaperSize', () => {
  const isValid = (v: string) => /^[A-Za-z0-9]+$/.test(v);

  it('accepts standard paper sizes', () => {
    expect(isValid('A4')).toBe(true);
    expect(isValid('A3')).toBe(true);
    expect(isValid('Letter')).toBe(true);
    expect(isValid('Legal')).toBe(true);
  });

  it('accepts lowercase', () => {
    expect(isValid('a4')).toBe(true);
    expect(isValid('letter')).toBe(true);
  });

  it('accepts numeric-only', () => {
    expect(isValid('4')).toBe(true);
  });

  it('rejects spaces', () => {
    expect(isValid('A 4')).toBe(false);
    expect(isValid(' A4')).toBe(false);
  });

  it('rejects command injection: semicolon', () => {
    expect(isValid(';rm -rf /')).toBe(false);
  });

  it('rejects command injection: $() subshell', () => {
    expect(isValid('$(whoami)')).toBe(false);
  });

  it('rejects command injection: backtick', () => {
    expect(isValid('`id`')).toBe(false);
  });

  it('rejects pipe injection', () => {
    expect(isValid('A4|cat')).toBe(false);
  });

  it('rejects hyphens', () => {
    expect(isValid('A-4')).toBe(false);
  });

  it('rejects underscores', () => {
    expect(isValid('A_4')).toBe(false);
  });

  it('rejects special characters', () => {
    expect(isValid('A4!')).toBe(false);
    expect(isValid('A4@')).toBe(false);
    expect(isValid('A4#')).toBe(false);
  });

  it('rejects angle brackets', () => {
    expect(isValid('<A4>')).toBe(false);
  });

  it('rejects quotes', () => {
    expect(isValid('"A4"')).toBe(false);
    expect(isValid("'A4'")).toBe(false);
  });

  it('rejects newline', () => {
    expect(isValid('A4\n')).toBe(false);
  });

  it('rejects null bytes', () => {
    expect(isValid('A4\0')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isValid('')).toBe(false);
  });

  it('rejects unicode', () => {
    expect(isValid('Ä4')).toBe(false);
  });
});

describe('sanitizePrinterName', () => {
  const isValid = (v: string) => /^[A-Za-z0-9_\-]+$/.test(v);

  it('accepts alphanumeric names', () => {
    expect(isValid('HP1020')).toBe(true);
    expect(isValid('printer1')).toBe(true);
  });

  it('accepts names with hyphens', () => {
    expect(isValid('HP-LaserJet-1020')).toBe(true);
  });

  it('accepts names with underscores', () => {
    expect(isValid('HP_LaserJet_1020')).toBe(true);
  });

  it('accepts mixed special allowed chars', () => {
    expect(isValid('My_Printer-01')).toBe(true);
  });

  it('rejects spaces', () => {
    expect(isValid('HP Printer')).toBe(false);
    expect(isValid(' HPPrinter')).toBe(false);
  });

  it('rejects command injection: semicolon', () => {
    expect(isValid(';rm -rf /')).toBe(false);
  });

  it('rejects command injection: $() subshell', () => {
    expect(isValid('$(whoami)')).toBe(false);
  });

  it('rejects command injection: backtick', () => {
    expect(isValid('`id`')).toBe(false);
  });

  it('rejects pipe injection', () => {
    expect(isValid('printer|cat')).toBe(false);
  });

  it('rejects dots', () => {
    expect(isValid('printer.local')).toBe(false);
  });

  it('rejects slashes', () => {
    expect(isValid('printer/name')).toBe(false);
    expect(isValid('printer\\name')).toBe(false);
  });

  it('rejects angle brackets', () => {
    expect(isValid('<printer>')).toBe(false);
  });

  it('rejects quotes', () => {
    expect(isValid('"printer"')).toBe(false);
    expect(isValid("'printer'")).toBe(false);
  });

  it('rejects newline', () => {
    expect(isValid('printer\n')).toBe(false);
  });

  it('rejects null bytes', () => {
    expect(isValid('printer\0')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isValid('')).toBe(false);
  });

  it('rejects unicode', () => {
    expect(isValid('prïnter')).toBe(false);
  });

  it('rejects very long string with injection at end', () => {
    expect(isValid('a'.repeat(100) + ';id')).toBe(false);
  });
});

describe('sanitizeCupsJobId', () => {
  const isValid = (v: string) => /^[A-Za-z0-9_\-]+$/.test(v);

  it('accepts valid CUPS job IDs', () => {
    expect(isValid('HP1020-123')).toBe(true);
    expect(isValid('printer_1-456')).toBe(true);
  });

  it('rejects injection in job IDs', () => {
    expect(isValid('HP1020-123; rm -rf /')).toBe(false);
    expect(isValid('HP1020-123$(whoami)')).toBe(false);
  });
});
