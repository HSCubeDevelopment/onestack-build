/**
 * Auto-merge unambiguous duplicate contacts left behind by the In N Out import (the source's customer
 * list was typed by hand over years, so the same person appears many times).
 *
 * THE RULE: same normalised name, AND no contradicting phone number.
 *   - "JOHN SMITH" x3, all blank phones, or all the same phone  -> merge (one person, typed repeatedly)
 *   - "NAVDEEP SINGH" x5 with 4 different phones                -> DO NOT TOUCH (different people who
 *                                                                  share a common name)
 * Name alone is not enough, and phone alone is not either — a shared mobile is often a family or a
 * company number. Requiring the name AND the absence of a conflict is what makes this safe to automate.
 *
 * Merging is reversible: the duplicate is soft-deleted and stamped fields.mergedIntoId.
 *
 * Goes through the HTTP API rather than the database, so every merge runs the real
 * ContactMergeService — repointing all fourteen contactId tables, inside one tenant transaction.
 *
 * Run (dry run first — it changes nothing and prints exactly what it would do):
 *   DRY_RUN=true bash scripts/with-env.sh .env.supabase npx tsx scripts/merge-duplicate-contacts.ts
 *   bash scripts/with-env.sh .env.supabase npx tsx scripts/merge-duplicate-contacts.ts
 */
import 'dotenv/config';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { normaliseName, normalisePhone } from '../src/contacts/duplicates';

const BASE = process.env.API_BASE ?? 'http://localhost:3001/api/v1';
const TENANT = process.env.DEMO_TENANT_ID ?? '';
const USER = process.env.DEMO_OWNER_USER_ID ?? '';
const SECRET = process.env.SUPABASE_JWT_SECRET ?? '';
const DRY_RUN = process.env.DRY_RUN === 'true';

if (!TENANT || !USER || !SECRET) {
  console.error('Missing env: DEMO_TENANT_ID, DEMO_OWNER_USER_ID, SUPABASE_JWT_SECRET');
  process.exit(1);
}

const token = jwt.sign({ sub: USER, tenant_id: TENANT, role: 'OWNER' }, SECRET, {
  expiresIn: '60m',
});

interface Row {
  id: string;
  displayName: string;
  phone: string | null;
  createdAt: Date;
}

async function main() {
  const db = new PrismaClient();
  const rows: Row[] = await db.contact.findMany({
    where: { tenantId: TENANT, deletedAt: null },
    select: { id: true, displayName: true, phone: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });
  await db.$disconnect();

  const byName = new Map<string, Row[]>();
  for (const r of rows) {
    const key = normaliseName(r.displayName);
    if (!key) continue;
    const list = byName.get(key);
    if (list) list.push(r);
    else byName.set(key, [r]);
  }

  const safe: { primary: Row; dups: Row[] }[] = [];
  let heldGroups = 0;
  let heldRecords = 0;

  for (const group of byName.values()) {
    if (group.length < 2) continue;
    const phones = new Set(group.map((r) => normalisePhone(r.phone)).filter(Boolean));
    if (phones.size > 1) {
      // Same name, genuinely different numbers — near-certainly different people. Leave for a human;
      // they still appear in the Find duplicates screen.
      heldGroups++;
      heldRecords += group.length - 1;
      continue;
    }
    // Keep the most informative record: one that has a phone, else the oldest (already sorted).
    const primary = group.find((r) => normalisePhone(r.phone)) ?? group[0];
    safe.push({ primary, dups: group.filter((r) => r.id !== primary.id) });
  }

  const totalMerges = safe.reduce((n, g) => n + g.dups.length, 0);
  console.log(`contacts:          ${rows.length}`);
  console.log(`duplicate groups:  ${safe.length + heldGroups}`);
  console.log(
    `${DRY_RUN ? 'would merge' : 'merging'}:       ${totalMerges} records into ${safe.length} primaries`,
  );
  console.log(
    `held for review:   ${heldRecords} records across ${heldGroups} groups (name matches, phones conflict)`,
  );

  if (DRY_RUN) {
    console.log('\nexamples of what would merge:');
    for (const g of safe.slice(0, 5))
      console.log(`  "${g.primary.displayName}" <- ${g.dups.length} duplicate(s)`);
    return;
  }

  let ok = 0;
  let failed = 0;
  const errors: string[] = [];
  for (const g of safe) {
    for (const d of g.dups) {
      const res = await fetch(`${BASE}/contacts/${g.primary.id}/merge/${d.id}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        ok++;
      } else {
        failed++;
        if (errors.length < 10)
          errors.push(`${d.displayName} (${d.id.slice(0, 8)}): ${res.status} ${await res.text()}`);
      }
      if ((ok + failed) % 50 === 0) console.log(`  ${ok + failed}/${totalMerges}`);
    }
  }
  console.log(`\nDONE: merged ${ok}, failed ${failed}`);
  if (errors.length) console.log('first failures:\n  ' + errors.join('\n  '));
  process.exitCode = failed ? 1 : 0;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
