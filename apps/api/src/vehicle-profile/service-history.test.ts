// The parse that turns imported notes back into a service record. Pure — no DB.
import { describe, expect, it } from 'vitest';
import {
  attachPhotos,
  buildServiceHistory,
  isServiceNote,
  parseServiceNote,
  type RawPhoto,
} from './service-history';

const note = (body: string, at: string) => ({ body, createdAt: new Date(at) });

const REAL = `Imported from the workshop WhatsApp group · 15 Aug 2026 · ref 403d8b02b6b5
Engine service
Tyre rotation
Customer: Angelo 0420233477`;

describe('isServiceNote', () => {
  it('recognises an imported record and nothing else', () => {
    expect(isServiceNote(REAL)).toBe(true);
    // The whole point of the marker: a person's note must never be read as a service entry.
    expect(isServiceNote('Customer called about the bumper')).toBe(false);
    expect(isServiceNote('Imported from somewhere else')).toBe(false);
  });
});

describe('parseServiceNote', () => {
  it('pulls out the ref, the work and the customer', () => {
    const r = parseServiceNote(note(REAL, '2026-08-15T09:35:00+10:00'))!;
    expect(r.ref).toBe('403d8b02b6b5');
    expect(r.work).toEqual(['Engine service', 'Tyre rotation']);
    expect(r.customer).toEqual({ name: 'Angelo', phone: '0420233477' });
  });

  it('handles a customer with only a number, and only a name', () => {
    const a = parseServiceNote(
      note(
        `Imported from the workshop WhatsApp group · 1 Jan 2026 · ref aaa\nservice\nCustomer: 0480420009`,
        '2026-01-01',
      ),
    )!;
    expect(a.customer).toEqual({ name: null, phone: '0480420009' });

    const b = parseServiceNote(
      note(
        `Imported from the workshop WhatsApp group · 1 Jan 2026 · ref bbb\nservice\nCustomer: Manav`,
        '2026-01-01',
      ),
    )!;
    expect(b.customer).toEqual({ name: 'Manav', phone: null });
  });

  it('drops the placeholder the importer writes for a photos-only visit', () => {
    const r = parseServiceNote(
      note(
        `Imported from the workshop WhatsApp group · 1 Jan 2026 · ref ccc\n(no description was written — photos only)`,
        '2026-01-01',
      ),
    )!;
    expect(r.work).toEqual([]);
  });

  it('returns null for a note a person wrote', () => {
    expect(parseServiceNote(note('Rang the customer, no answer', '2026-01-01'))).toBeNull();
  });
});

describe('attachPhotos', () => {
  const photo = (id: string, at: string, caption = 'Service photo'): RawPhoto => ({
    id,
    fileName: `${id}.jpg`,
    caption,
    createdAt: new Date(at),
  });

  it('puts each photo on the visit it was taken at, not the first one', () => {
    const records = [
      parseServiceNote(
        note(
          `${'Imported from the workshop WhatsApp group'} · x · ref jul\nservice`,
          '2026-07-09T11:05:00+10:00',
        ),
      )!,
      parseServiceNote(
        note(
          `${'Imported from the workshop WhatsApp group'} · x · ref aug\nservice`,
          '2026-08-15T09:35:00+10:00',
        ),
      )!,
    ];
    attachPhotos(records, [
      photo('a', '2026-07-09T11:06:00+10:00'),
      photo('b', '2026-08-15T09:36:00+10:00'),
      photo('c', '2026-08-15T09:37:00+10:00'),
    ]);
    expect(records[0]!.photos.map((p) => p.id)).toEqual(['a']);
    expect(records[1]!.photos.map((p) => p.id)).toEqual(['b', 'c']);
  });

  it('leaves a far-away photo off rather than guessing it onto the nearest visit', () => {
    // Six weeks from the only service — attaching it would be an invention.
    const records = [
      parseServiceNote(
        note(
          `Imported from the workshop WhatsApp group · x · ref only\nservice`,
          '2026-07-09T11:05:00+10:00',
        ),
      )!,
    ];
    attachPhotos(records, [photo('far', '2026-08-20T11:05:00+10:00')]);
    expect(records[0]!.photos).toEqual([]);
  });

  it('ignores photos that are not service photos', () => {
    const records = [
      parseServiceNote(
        note(
          `Imported from the workshop WhatsApp group · x · ref r\nservice`,
          '2026-07-09T11:05:00+10:00',
        ),
      )!,
    ];
    attachPhotos(records, [photo('damage', '2026-07-09T11:06:00+10:00', 'Accident damage')]);
    expect(records[0]!.photos).toEqual([]);
  });
});

describe('buildServiceHistory', () => {
  it('returns newest first and skips anything a person wrote', () => {
    const history = buildServiceHistory(
      [
        note(
          `Imported from the workshop WhatsApp group · x · ref jul\nservice`,
          '2026-07-09T11:05:00+10:00',
        ),
        note('Customer rang about the bumper', '2026-08-01T09:00:00+10:00'),
        note(
          `Imported from the workshop WhatsApp group · x · ref sep\nEngine service`,
          '2026-09-14T10:51:00+10:00',
        ),
      ],
      [],
    );
    expect(history.map((h) => h.ref)).toEqual(['sep', 'jul']);
  });

  it('is empty for a car that has never been serviced', () => {
    expect(buildServiceHistory([note('Booked in for a quote', '2026-01-01')], [])).toEqual([]);
  });
});
