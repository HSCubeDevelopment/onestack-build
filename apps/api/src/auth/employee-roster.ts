/**
 * The workshop's employee roster, taken from the attendance sheet (ATTANDANCE.xlsx).
 *
 * These names are seeded as real STAFF logins in the demo tenant so the sign-in page can offer
 * "sign in as <employee>" from a dropdown. Each becomes a genuine Supabase Auth user + Membership, so a
 * movement or clock-in they record is attributed to them — this is the same login path as the demo
 * owner/staff/tow accounts, not a new auth mechanism.
 *
 * Pay rates and overtime from the sheet are deliberately NOT stored here: compensation data has no place
 * on a public sign-in surface. It stays in the source sheet for a future payroll/attendance feature.
 */
export interface RosterEmployee {
  /** Display name shown in the dropdown. */
  name: string;
  /** Login email in the demo tenant. */
  email: string;
  /** Which shop they're rostered at. */
  site: string;
}

export const WORKSHOP_SITES = {
  lipton: '19 Lipton Drive, Thomastown',
  temple: '57 Temple Drive, Thomastown',
} as const;

// First names exactly as they appear on the sheet, grouped by site. LOVISH and ABHAY are listed at both
// sites; we keep one login each, rostered to their first-listed site (Lipton Drive).
const NAMES: { name: string; site: string }[] = [
  { name: 'Elmer', site: WORKSHOP_SITES.lipton },
  { name: 'Jovan', site: WORKSHOP_SITES.lipton },
  { name: 'Edwin', site: WORKSHOP_SITES.lipton },
  { name: 'Zeth', site: WORKSHOP_SITES.lipton },
  { name: 'Danny', site: WORKSHOP_SITES.lipton },
  { name: 'Josleyne', site: WORKSHOP_SITES.lipton },
  { name: 'Mujtaba', site: WORKSHOP_SITES.lipton },
  { name: 'Mansoor', site: WORKSHOP_SITES.lipton },
  { name: 'Abdullah', site: WORKSHOP_SITES.lipton },
  { name: 'Lovish', site: WORKSHOP_SITES.lipton },
  { name: 'Abhay', site: WORKSHOP_SITES.lipton },
  { name: 'Roden', site: WORKSHOP_SITES.temple },
  { name: 'Rex', site: WORKSHOP_SITES.temple },
  { name: 'Allan', site: WORKSHOP_SITES.temple },
  { name: 'Tarik', site: WORKSHOP_SITES.temple },
  { name: 'Rodrigo', site: WORKSHOP_SITES.temple },
  { name: 'Jaiveer', site: WORKSHOP_SITES.temple },
  { name: 'Jot', site: WORKSHOP_SITES.temple },
  { name: 'Pradeep', site: WORKSHOP_SITES.temple },
  { name: 'Manga', site: WORKSHOP_SITES.temple },
];

/** `Elmer` -> `elmer@onestack.test`. Single first names, so no collisions. */
export function employeeEmail(name: string): string {
  return `${name.toLowerCase().replace(/[^a-z0-9]/g, '')}@onestack.test`;
}

export const EMPLOYEE_ROSTER: RosterEmployee[] = NAMES.map((n) => ({
  name: n.name,
  site: n.site,
  email: employeeEmail(n.name),
}));
