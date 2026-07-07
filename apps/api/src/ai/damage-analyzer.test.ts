// Unit tests for the AI gateway's pure pieces (no DB, no external API): the deterministic stub
// analyzer, and the parser that turns a Claude reply into a clean, validated scope. These are the
// error-prone bits — the DB-backed service is covered by the integration test.
import { describe, expect, it } from 'vitest';
import { parseScope } from './anthropic-damage-analyzer';
import { DAMAGE_OPERATIONS, MAX_ANALYSIS_IMAGES } from './damage-analyzer';
import { StubDamageAnalyzer } from './stub-damage-analyzer';

const img = (n: number) =>
  Array.from({ length: n }, () => ({ contentType: 'image/png', dataBase64: 'AA==' }));

describe('StubDamageAnalyzer', () => {
  const stub = new StubDamageAnalyzer();

  it('names itself "stub" so scopes are auditable as non-AI', () => {
    expect(stub.name).toBe('stub');
  });

  it('sizes the scope to the photo count and always yields at least one item', async () => {
    const one = await stub.analyze({ images: img(1) });
    const three = await stub.analyze({ images: img(3) });
    expect(one.items).toHaveLength(1);
    expect(three.items).toHaveLength(3);

    // Zero photos still yields a (single-item) scope — the service guards the no-photo case upstream.
    const none = await stub.analyze({ images: img(0) });
    expect(none.items.length).toBeGreaterThanOrEqual(1);
  });

  it('caps the scope at the image cost cap and only emits valid operations', async () => {
    const many = await stub.analyze({ images: img(50) });
    expect(many.items.length).toBeLessThanOrEqual(MAX_ANALYSIS_IMAGES);
    for (const item of many.items) {
      expect(item.panel).toBeTruthy();
      expect(DAMAGE_OPERATIONS).toContain(item.operation);
    }
    // At least one "replace" — that's what becomes a part line downstream.
    expect(many.items.some((i) => i.operation === 'replace')).toBe(true);
  });

  it('is deterministic — same input, same scope (repeatable tests)', async () => {
    const a = await stub.analyze({ images: img(4) });
    const b = await stub.analyze({ images: img(4) });
    expect(a).toEqual(b);
  });
});

describe('parseScope', () => {
  it('parses a clean JSON reply', () => {
    const out = parseScope(
      '{"summary":"two panels","items":[{"panel":"Bonnet","operation":"repair","note":"dent","confidence":0.8}]}',
    );
    expect(out.summary).toBe('two panels');
    expect(out.items).toEqual([
      { panel: 'Bonnet', operation: 'repair', note: 'dent', confidence: 0.8 },
    ]);
  });

  it('extracts JSON even when wrapped in prose', () => {
    const out = parseScope(
      'Here is the scope:\n{"summary":"x","items":[{"panel":"Door","operation":"paint"}]}\nThanks!',
    );
    expect(out.items[0]?.panel).toBe('Door');
  });

  it('drops items with an invalid operation or missing panel', () => {
    const out = parseScope(
      '{"items":[{"panel":"Roof","operation":"weld"},{"panel":"","operation":"paint"},{"panel":"Guard","operation":"replace"}]}',
    );
    expect(out.items).toHaveLength(1);
    expect(out.items[0]?.panel).toBe('Guard');
  });

  it('clamps confidence into 0..1', () => {
    const out = parseScope('{"items":[{"panel":"Boot","operation":"paint","confidence":5}]}');
    expect(out.items[0]?.confidence).toBe(1);
  });

  it('throws on unparseable, invalid, or empty output', () => {
    expect(() => parseScope('no json here')).toThrow();
    expect(() => parseScope('{not valid json}')).toThrow();
    expect(() => parseScope('{"items":[]}')).toThrow(/no usable/i);
  });
});
