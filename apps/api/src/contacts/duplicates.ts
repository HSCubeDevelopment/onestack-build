/**
 * Duplicate detection — pure logic (Phase 4, card #200). GENERIC core (Customer & CRM). Finds likely
 * duplicate contacts within a tenant by clustering on a normalised phone, email, or name. No I/O here; the
 * service passes the tenant's contacts in. Detection is READ-ONLY and safe — merging is a separate,
 * human-confirmed step.
 */

export interface DupContact {
  id: string;
  displayName: string;
  email: string | null;
  phone: string | null;
}

export type MatchReason = 'phone' | 'email' | 'name';

export interface DuplicateGroup {
  /** Why these were grouped (the dimensions on which at least two share a value). */
  reasons: MatchReason[];
  contacts: DupContact[];
}

/** Digits only; keep the last 9 (drops +61 / 0 country-code and formatting differences). Empty if too short. */
export function normalisePhone(phone: string | null | undefined): string {
  const digits = (phone ?? '').replace(/\D/g, '');
  if (digits.length < 6) return '';
  return digits.slice(-9);
}

export function normaliseEmail(email: string | null | undefined): string {
  return (email ?? '').trim().toLowerCase();
}

export function normaliseName(name: string | null | undefined): string {
  return (name ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Cluster contacts that share a normalised phone, email, or name (union-find), returning each cluster of
 * two or more as a group with the reasons it was formed. Deterministic; order-stable by first appearance.
 */
export function findDuplicates(contacts: DupContact[]): DuplicateGroup[] {
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r)!;
    let c = x;
    while (parent.get(c) !== r) {
      const n = parent.get(c)!;
      parent.set(c, r);
      c = n;
    }
    return r;
  };
  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };

  for (const c of contacts) parent.set(c.id, c.id);

  // Link contacts sharing a key on each dimension.
  const byKey = (get: (c: DupContact) => string) => {
    const seen = new Map<string, string>();
    for (const c of contacts) {
      const k = get(c);
      if (!k) continue;
      const prev = seen.get(k);
      if (prev) union(prev, c.id);
      else seen.set(k, c.id);
    }
  };
  byKey((c) => normalisePhone(c.phone));
  byKey((c) => normaliseEmail(c.email));
  byKey((c) => normaliseName(c.displayName));

  // Gather clusters of 2+.
  const clusters = new Map<string, DupContact[]>();
  for (const c of contacts) {
    const root = find(c.id);
    (clusters.get(root) ?? clusters.set(root, []).get(root)!).push(c);
  }

  const groups: DuplicateGroup[] = [];
  for (const members of clusters.values()) {
    if (members.length < 2) continue;
    groups.push({ reasons: reasonsFor(members), contacts: members });
  }
  return groups;
}

/** Which dimensions actually have a shared value across ≥2 members of a cluster. */
function reasonsFor(members: DupContact[]): MatchReason[] {
  const reasons: MatchReason[] = [];
  const shares = (get: (c: DupContact) => string): boolean => {
    const seen = new Set<string>();
    for (const m of members) {
      const k = get(m);
      if (!k) continue;
      if (seen.has(k)) return true;
      seen.add(k);
    }
    return false;
  };
  if (shares((c) => normalisePhone(c.phone))) reasons.push('phone');
  if (shares((c) => normaliseEmail(c.email))) reasons.push('email');
  if (shares((c) => normaliseName(c.displayName))) reasons.push('name');
  return reasons;
}
