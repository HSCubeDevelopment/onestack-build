import {
  LayoutDashboard,
  KanbanSquare,
  Wrench,
  CalendarDays,
  Clock,
  Users,
  Mail,
  Tags,
  SlidersHorizontal,
  LifeBuoy,
  Layers3,
  ListChecks,
  Boxes,
  Gift,
  Share2,
  ScanLine,
  Webhook,
  Blocks,
  Car,
  Warehouse,
  Building2,
  Users2,
  DollarSign,
  type LucideIcon,
} from 'lucide-react';

/**
 * The app's navigation, in ONE place.
 *
 * Both the desktop sidebar and the phone "More" page render from this list. They used to be separate
 * hand-written lists, which meant the More page happily offered an employee the price book, the POS and
 * the settings screens — every one of which the API answers with a 403 — and also showed the off-wedge
 * retail screens card #300 exists to hide. A second list is a second thing to forget.
 */

/**
 * `staff: true` marks a destination an employee may open. It mirrors the API's @AllowStaff() allowlist —
 * everything else is OWNER-only there and would 403, so we don't render it. The API is the enforcement;
 * this only decides what's shown. If you widen one side, widen the other.
 *
 * `offWedge: true` marks a destination built for a different vertical (retail/salon), not panel & paint
 * (card #300). The pages and their APIs still work — we just don't lead a panel shop to them. Drop the
 * flag to put one back in the sidebar once a pack that wants it exists.
 */
export type NavItem = {
  href: string;
  label: string;
  Icon: LucideIcon;
  alert?: boolean;
  staff?: boolean;
  offWedge?: boolean;
  /** 40.8: a money destination — shown to OWNER always, and to STAFF only with finance access. */
  financeView?: boolean;
};
export type NavRow = { section: string } | NavItem;

export const NAV: NavRow[] = [
  { section: 'Menu' },
  { href: '/', label: 'Dashboard', Icon: LayoutDashboard },
  { href: '/board', label: 'Job board', Icon: KanbanSquare },
  { href: '/jobs', label: 'Jobs', Icon: Wrench, staff: true },
  { href: '/calendar', label: 'Calendar', Icon: CalendarDays },
  { href: '/waitlist', label: 'Waitlist', Icon: ListChecks },
  { href: '/roster', label: 'Roster', Icon: CalendarDays, staff: true },
  { href: '/time-clock', label: 'Time clock', Icon: Clock, staff: true },
  { section: 'Fleet & courtesy cars' },
  { href: '/fleet', label: 'Fleet & cars', Icon: Car },
  { href: '/fleet/bookings', label: 'Fleet bookings', Icon: CalendarDays },
  // Yards: staff (or a tow driver) can park a car and see the awaiting list; managing the yard
  // network is owner-only, enforced by the API. `staff: true` mirrors the @AllowStaff reads.
  { href: '/yards', label: 'Yards', Icon: Warehouse, staff: true },
  { section: 'Customers & sales' },
  { href: '/customers', label: 'Customers', Icon: Users, staff: true },
  { href: '/leads', label: 'Leads', Icon: Mail, alert: true },
  { href: '/price-book', label: 'Price book', Icon: Tags },
  { href: '/inventory', label: 'Inventory', Icon: Boxes, offWedge: true },
  { href: '/loyalty', label: 'Loyalty', Icon: Gift, offWedge: true },
  { href: '/referrals', label: 'Referrals', Icon: Share2, offWedge: true },
  { href: '/pos', label: 'Point of sale', Icon: ScanLine, offWedge: true },
  { section: 'Finance' },
  // Money: OWNER always, plus STAFF the owner has granted finance access (40.8). The API's
  // /finance/overview is gated the same way (FinanceGuard).
  { href: '/money', label: 'Money & Payments', Icon: DollarSign, financeView: true },
  { section: 'Settings' },
  // Sites: owner-only management (create/edit/delete 403 for staff), so no `staff` flag (SITE-1).
  { href: '/settings/sites', label: 'Sites', Icon: Building2 },
  // Team: owner manages members + finance access (40.8).
  { href: '/settings/team', label: 'Team', Icon: Users2 },
  { href: '/settings/custom-fields', label: 'Custom fields', Icon: SlidersHorizontal },
  { href: '/settings/webhooks', label: 'Webhooks', Icon: Webhook },
  { href: '/settings/integrations', label: 'Integrations', Icon: Blocks },
];

/** Drop any section heading left with nothing under it — otherwise a heading sits above empty space. */
function pruneEmptySections(rows: NavRow[]): NavRow[] {
  return rows.filter((row, i) => {
    if (!('section' in row)) return true;
    const next = rows[i + 1];
    return next !== undefined && !('section' in next);
  });
}

/**
 * Hide what this vertical doesn't use (#300), then everything an employee can't open, then tidy up any
 * heading the filtering emptied.
 */
export function navFor(role: 'OWNER' | 'STAFF', opts?: { canViewFinance?: boolean }): NavRow[] {
  const canFinance = role === 'OWNER' || !!opts?.canViewFinance;
  const onWedge = NAV.filter((r) => 'section' in r || !r.offWedge);
  const allowed =
    role === 'OWNER'
      ? onWedge
      : // STAFF: their allowlisted destinations, plus money destinations only if granted finance access.
        onWedge.filter((r) => 'section' in r || r.staff || (r.financeView && canFinance));
  return pruneEmptySections(allowed);
}
