/**
 * Pure logic for turning a damage scope into a draft parts list (Phase 2 flagship, slice B). No DB, no
 * network — so it's cheap to unit test. Only "replace" panels become parts (repair/paint are labour,
 * out of MVP scope). Each part is priced from a matching price-book item if one is found, otherwise left
 * at 0 for the estimator to fill in. Nothing here is a money quote — it's an editable working list.
 */
import { DamageOperation } from './damage-analyzer';

export interface ScopeItemLike {
  panel: string;
  operation: DamageOperation;
  note?: string | null;
}

export interface PriceBookPart {
  id: string;
  name: string;
  defaultUnitPriceCents: number;
}

export interface DraftPart {
  description: string;
  quantity: number;
  unitPriceCents: number;
  priceBookItemId: string | null;
}

/**
 * Find the best price-book part for a panel name. Prefers an exact (case-insensitive) name match, then a
 * substring match either way (e.g. panel "Front bumper" ~ item "Front bumper bar"). Returns null if the
 * panel doesn't confidently match anything — the estimator prices it by hand.
 */
export function matchPriceBookPart(panel: string, parts: PriceBookPart[]): PriceBookPart | null {
  const needle = panel.trim().toLowerCase();
  if (!needle) return null;
  const exact = parts.find((p) => p.name.trim().toLowerCase() === needle);
  if (exact) return exact;
  const partial = parts.find((p) => {
    const name = p.name.trim().toLowerCase();
    return name.includes(needle) || needle.includes(name);
  });
  return partial ?? null;
}

/** Build the draft parts list from a scope's "replace" items, pricing each from the price book if matched. */
export function partsFromScope(
  scopeItems: ScopeItemLike[],
  priceBookParts: PriceBookPart[],
): DraftPart[] {
  return scopeItems
    .filter((i) => i.operation === 'replace')
    .map((i) => {
      const match = matchPriceBookPart(i.panel, priceBookParts);
      return {
        description: i.note ? `${i.panel} — ${i.note}` : i.panel,
        quantity: 1,
        unitPriceCents: match ? match.defaultUnitPriceCents : 0,
        priceBookItemId: match ? match.id : null,
      };
    });
}
