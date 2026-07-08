/**
 * Pure tag-name handling (Phase 3 — segmentation & tagging). No DB — cheap to unit test. A tag name is
 * trimmed and must be non-empty; comparison for duplicates is case-insensitive (matching the DB's
 * lower(name) unique index).
 */

/** Trim + validate a tag name. Throws (via the provided factory) if empty. */
export function normaliseTagName(raw: string, fail: (msg: string) => Error): string {
  const name = (raw ?? '').trim();
  if (!name) throw fail('Tag name is required');
  if (name.length > 60) throw fail('Tag name must be 60 characters or fewer');
  return name;
}

/** Case-insensitive equality used to detect duplicate tag names. */
export function sameTagName(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}
