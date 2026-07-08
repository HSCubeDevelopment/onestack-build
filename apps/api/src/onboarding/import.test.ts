import { describe, expect, it } from 'vitest';
import { normaliseRow, parseContactsCsv, planImport, summarise } from './import';

describe('parseContactsCsv', () => {
  it('parses a header + rows into keyed objects', () => {
    const rows = parseContactsCsv('displayName,phone,email\nJane,0400000000,jane@x.com\nSam,0411111111,');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ displayname: 'Jane', phone: '0400000000', email: 'jane@x.com' });
    expect(rows[1]).toEqual({ displayname: 'Sam', phone: '0411111111', email: '' });
  });

  it('ignores blank lines and returns [] for empty input', () => {
    expect(parseContactsCsv('')).toEqual([]);
    expect(parseContactsCsv('name,phone\n\n\n')).toEqual([]);
  });
});

describe('normaliseRow', () => {
  it('maps loose column names', () => {
    expect(normaliseRow({ name: 'Jane', mobile: '0400', email: 'j@x.com' })).toEqual({
      displayName: 'Jane',
      phone: '0400',
      email: 'j@x.com',
    });
  });

  it('returns null for a fully blank row', () => {
    expect(normaliseRow({ name: '', phone: '', email: '' })).toBeNull();
  });
});

describe('planImport', () => {
  it('marks ok/error/duplicate per row (row numbers include the header)', () => {
    const raw = [
      { displayname: 'Jane', phone: '0400000000', email: 'jane@x.com' }, // ok (row 2)
      { displayname: '', phone: '0411', email: '' }, // missing name (row 3)
      { displayname: 'NoPhone', phone: '', email: '' }, // missing phone (row 4)
      { displayname: 'Bad', phone: '0422', email: 'not-an-email' }, // bad email (row 5)
      { displayname: 'DupInBatch', phone: '0400000000', email: '' }, // dup of row 2 (row 6)
      { displayname: 'Existing', phone: '0499999999', email: '' }, // dup of on-file (row 7)
    ];
    const results = planImport(raw, new Set(['0499999999']));
    expect(results.map((r) => `${r.row}:${r.status}`)).toEqual([
      '2:ok',
      '3:error',
      '4:error',
      '5:error',
      '6:duplicate',
      '7:duplicate',
    ]);
  });

  it('summarises the plan', () => {
    const results = planImport(
      [
        { name: 'A', phone: '1' },
        { name: 'B', phone: '' },
      ],
      new Set(),
    );
    expect(summarise(results)).toEqual({ total: 2, ok: 1, duplicate: 0, error: 1 });
  });
});
