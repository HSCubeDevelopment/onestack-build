import { Home, Car, CalendarClock, Search, type LucideIcon } from 'lucide-react';

/**
 * The In N Out employee app (migrated onto OneStack). This is the SHOP-FLOOR staff experience: a
 * phone-first car in/out tool with a Home · Cars · ＋ · Today · Search shell — faithful, feature for
 * feature, to the legacy In N Out app. Owners keep the full OneStack admin; the TOW role is untouched.
 */
export type InOutTab = { href: string; label: string; Icon: LucideIcon };

export const INOUT_TABS: InOutTab[] = [
  { href: '/', label: 'Home', Icon: Home },
  { href: '/inout/cars', label: 'Cars', Icon: Car },
  { href: '/inout/today', label: 'Today', Icon: CalendarClock },
  { href: '/inout/search', label: 'Search', Icon: Search },
];

/** The six Quick-add flows, in the legacy app's order. Each opens the movement/return form in a mode. */
export type QuickFlow = {
  key: string;
  title: string;
  sub: string;
  href: string;
  tone: 'brand' | 'green' | 'red' | 'amber' | 'blue';
};

export const QUICK_FLOWS: QuickFlow[] = [
  {
    key: 'rent',
    title: 'Rent a car out',
    sub: 'Our car goes out on rent',
    href: '/inout/new?mode=rent',
    tone: 'blue',
  },
  {
    key: 'full',
    title: 'New movement',
    sub: 'Customer car in · our car out',
    href: '/inout/new?mode=full',
    tone: 'brand',
  },
  {
    key: 'return',
    title: 'Record return',
    sub: 'Our car comes back',
    href: '/inout/return',
    tone: 'green',
  },
  {
    key: 'intake',
    title: 'Customer car intake',
    sub: 'Damaged car dropped in — no rental',
    href: '/inout/new?mode=intake',
    tone: 'red',
  },
  {
    key: 'handback',
    title: 'Give car back',
    sub: 'Repaired car returned + tow card',
    href: '/inout/new?mode=handback',
    tone: 'green',
  },
  {
    key: 'booking',
    title: 'New booking',
    sub: 'Reserve a car for later',
    href: '/fleet/bookings',
    tone: 'amber',
  },
];

/** Turn a fleet audit action string into a plain-English activity line. */
export function activityLabel(action: string): string {
  const map: Record<string, string> = {
    'fleet.movement.created': 'added a movement',
    'fleet.movement.updated': 'updated a movement',
    'fleet.return.created': 'recorded a return',
    'fleet.return.updated': 'updated a return',
    'fleet.booking.created': 'added a booking',
    'fleet.booking.cancelled': 'cancelled a booking',
    'fleet.vehicle.updated': 'updated a car',
  };
  return map[action] ?? action.replace(/^fleet\./, '').replace(/[._]/g, ' ');
}
