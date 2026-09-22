/**
 * The mechanics, and the work they actually record.
 *
 * Manga and Jot service cars; the rest of the roster does panel and paint, In/Out, tow. Their job is
 * different enough that the shared employee home is mostly buttons they never press, so they get their
 * own screen. This is PRESENTATION only — they are STAFF like everyone else, with the same API access.
 * Nothing here grants or withholds anything; it decides which home screen renders.
 *
 * Matched on the sign-in email because that is stable, unlike a display name, and unlike a user id it
 * is the same in every environment. Adding a mechanic is one line.
 */
const MECHANIC_EMAILS: ReadonlySet<string> = new Set(['manga@onestack.test', 'jot@onestack.test']);

export function isMechanic(email: string | null | undefined): boolean {
  return email ? MECHANIC_EMAILS.has(email.trim().toLowerCase()) : false;
}

/**
 * The jobs they record, taken from ~3,900 messages of the WhatsApp group this replaces.
 *
 * These are the exact phrases they already type, with the counts they appeared with: `service` 182,
 * `engine service` 166, `tyre rotation` 108, `cabin filter` 47, `air filter` 40. Offering them as taps
 * is the difference between logging a car in three touches and typing it out on a phone with oily
 * hands — which is why the WhatsApp group won in the first place.
 *
 * `Other` is not a fallback for a missing option; the free-text box is always there. Anything typed
 * often enough to matter should be promoted up here.
 */
export interface WorkGroup {
  title: string;
  items: string[];
}

export const WORK_MENU: WorkGroup[] = [
  {
    title: 'Service',
    items: ['Engine service', 'Service', 'Transmission service'],
  },
  {
    title: 'Filters',
    items: ['Cabin filter', 'Air filter', 'Hybrid filter', 'Fuel filter'],
  },
  {
    title: 'Tyres',
    items: ['Tyre rotation', 'New tyre', 'Tyre repair', 'Puncture repair', 'Wheel alignment'],
  },
  {
    title: 'Brakes',
    items: ['Front brake pads', 'Rear brake pads', 'Brake fluid'],
  },
  {
    title: 'Other',
    items: ['Wipers', 'New battery', 'Drive belt', 'Spark plugs', 'Coolant'],
  },
];

/** Every quick-pick in one list, for rendering a summary without walking the groups. */
export const ALL_WORK_ITEMS: string[] = WORK_MENU.flatMap((g) => g.items);

/**
 * Turn the picked items and the free text into the note that goes on the job.
 *
 * One line each, the way they already write it in the group — so someone reading the job later sees
 * the same shape they are used to, not a paragraph.
 */
export function buildWorkNote(picked: string[], extra: string): string {
  const lines = [...picked];
  const free = extra.trim();
  if (free) lines.push(free);
  return lines.join('\n');
}
