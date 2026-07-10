import { describe, expect, it } from 'vitest';
import { findDuplicates, normaliseEmail, normalisePhone } from './duplicates';

const c = (id: string, displayName: string, phone: string | null, email: string | null) => ({
  id,
  displayName,
  phone,
  email,
});

describe('normalisePhone', () => {
  it('ignores formatting and country code, keeping the last 9 digits', () => {
    expect(normalisePhone('0400 000 000')).toBe(normalisePhone('+61 400 000 000'));
    expect(normalisePhone('(03) 9999 0000')).toBe('399990000');
  });
  it('is empty for too-short input', () => {
    expect(normalisePhone('123')).toBe('');
    expect(normalisePhone(null)).toBe('');
  });
});

describe('normaliseEmail', () => {
  it('lowercases and trims', () => {
    expect(normaliseEmail('  Jane@X.COM ')).toBe('jane@x.com');
  });
});

describe('findDuplicates', () => {
  it('groups contacts sharing a phone', () => {
    const groups = findDuplicates([
      c('1', 'Jane Smith', '0400000000', 'jane@x.com'),
      c('2', 'J Smith', '+61400000000', null),
      c('3', 'Bob', '0411111111', 'bob@x.com'),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.contacts.map((x) => x.id).sort()).toEqual(['1', '2']);
    expect(groups[0]?.reasons).toContain('phone');
  });

  it('groups on email and on name too, and reports each reason', () => {
    const groups = findDuplicates([
      c('1', 'Jane Smith', '0400000000', 'shared@x.com'),
      c('2', 'Different Name', '0499999999', 'shared@x.com'),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.reasons).toEqual(['email']);
  });

  it('clusters transitively (A~B by phone, B~C by email → one group)', () => {
    const groups = findDuplicates([
      c('A', 'Jane', '0400000000', 'a@x.com'),
      c('B', 'Jane', '0400000000', 'b@x.com'),
      c('C', 'Janey', '0422222222', 'b@x.com'),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.contacts.map((x) => x.id).sort()).toEqual(['A', 'B', 'C']);
    // A~B share phone + name "Jane"; B~C share email "b@x.com".
    expect(groups[0]?.reasons.slice().sort()).toEqual(['email', 'name', 'phone']);
  });

  it('returns no groups when everyone is distinct', () => {
    expect(
      findDuplicates([
        c('1', 'Jane', '0400000000', 'jane@x.com'),
        c('2', 'Bob', '0411111111', 'bob@x.com'),
      ]),
    ).toHaveLength(0);
  });

  it('does not group on empty/short values', () => {
    expect(
      findDuplicates([
        c('1', 'A', '', ''),
        c('2', 'B', null, null),
      ]),
    ).toHaveLength(0);
  });
});
