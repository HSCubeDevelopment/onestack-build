import { describe, expect, it } from 'vitest';
import { DamageAnalysisResult } from './damage-analyzer';
import {
  DEFAULT_LABOUR_RATE_AUD,
  DEFAULT_PART_PRICE_AUD,
  LABOUR_HOURS,
  PAINT_MATERIALS_AUD,
  priceScope,
} from './estimate-pricing';

const scope = (items: DamageAnalysisResult['items']): DamageAnalysisResult => ({
  summary: 'Front-end collision damage.',
  items,
});

describe('priceScope', () => {
  it('prices a single replaced panel: one part, fit labour, paint materials, +GST', () => {
    const draft = priceScope(scope([{ panel: 'Front bumper', operation: 'replace' }]));

    // One part line for the replaced panel.
    expect(draft.parts).toEqual([
      {
        name: 'Front bumper (replacement panel)',
        quantity: 1,
        unitPriceAud: DEFAULT_PART_PRICE_AUD,
      },
    ]);
    // One labour line at the replace-hours default.
    expect(draft.labour).toEqual([
      { task: 'replace Front bumper', operation: 'replace', hours: LABOUR_HOURS.replace },
    ]);

    expect(draft.partsSubtotalAud).toBe(DEFAULT_PART_PRICE_AUD); // 350
    expect(draft.labourSubtotalAud).toBe(LABOUR_HOURS.replace * DEFAULT_LABOUR_RATE_AUD); // 3 * 95 = 285
    expect(draft.materialsAud).toBe(PAINT_MATERIALS_AUD); // replaced panel is painted → 120

    const subtotal = 350 + 285 + 120; // 755
    expect(draft.subtotalAud).toBe(subtotal);
    expect(draft.gstAud).toBe(75.5);
    expect(draft.totalAud).toBe(subtotal + 75.5); // 830.5
  });

  it('a plain repair adds labour but no part and no paint materials', () => {
    const draft = priceScope(scope([{ panel: 'Left door', operation: 'repair' }]));
    expect(draft.parts).toEqual([]);
    expect(draft.materialsAud).toBe(0);
    expect(draft.labourSubtotalAud).toBe(LABOUR_HOURS.repair * DEFAULT_LABOUR_RATE_AUD); // 2.5 * 95 = 237.5
    expect(draft.partsSubtotalAud).toBe(0);
  });

  it('a paint operation charges paint materials but adds no replacement part', () => {
    const draft = priceScope(scope([{ panel: 'Bonnet', operation: 'paint' }]));
    expect(draft.parts).toEqual([]);
    expect(draft.materialsAud).toBe(PAINT_MATERIALS_AUD);
    expect(draft.labourSubtotalAud).toBe(LABOUR_HOURS.paint * DEFAULT_LABOUR_RATE_AUD); // 2 * 95 = 190
  });

  it('sums multiple panels and carries the scope through as editable fixes', () => {
    const items: DamageAnalysisResult['items'] = [
      { panel: 'Front bumper', operation: 'replace' },
      { panel: 'Bonnet', operation: 'paint' },
      { panel: 'Left guard', operation: 'repair' },
    ];
    const draft = priceScope(scope(items));

    expect(draft.fixes).toEqual(items); // the "what needs fixing" list is the analyzer's scope, unedited
    expect(draft.parts).toHaveLength(1); // only the replaced panel
    expect(draft.labour).toHaveLength(3); // every operation is labour
    expect(draft.materialsAud).toBe(2 * PAINT_MATERIALS_AUD); // replace + paint are painted panels

    const labour = (LABOUR_HOURS.replace + LABOUR_HOURS.paint + LABOUR_HOURS.repair) * 95; // (3+2+2.5)*95
    expect(draft.labourSubtotalAud).toBe(labour);
    expect(draft.subtotalAud).toBe(draft.partsSubtotalAud + labour + draft.materialsAud);
    expect(draft.totalAud).toBeCloseTo(draft.subtotalAud * 1.1, 2);
  });

  it('honours a custom labour rate but ignores a nonsensical one', () => {
    const one = scope([{ panel: 'Boot', operation: 'repair' }]);
    expect(priceScope(one, { labourRateAud: 140 }).labourRateAud).toBe(140);
    expect(priceScope(one, { labourRateAud: 140 }).labourSubtotalAud).toBe(
      LABOUR_HOURS.repair * 140,
    );
    // Zero / negative / NaN fall back to the default rather than zeroing the labour.
    expect(priceScope(one, { labourRateAud: 0 }).labourRateAud).toBe(DEFAULT_LABOUR_RATE_AUD);
    expect(priceScope(one, { labourRateAud: -5 }).labourRateAud).toBe(DEFAULT_LABOUR_RATE_AUD);
  });

  it('always carries the human-review disclaimer', () => {
    const draft = priceScope(scope([{ panel: 'Roof', operation: 'paint' }]));
    expect(draft.disclaimer).toMatch(/review each line/i);
    expect(draft.disclaimer).toMatch(/hidden or structural/i);
  });
});
