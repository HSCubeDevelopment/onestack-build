'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
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
  type LucideIcon,
} from 'lucide-react';
import { ThemeToggle } from '@/components/ThemeToggle';

/**
 * `staff: true` marks a destination an employee may open. It mirrors the API's @AllowStaff() allowlist —
 * everything else is OWNER-only there and would 403, so we don't render it. The API is the enforcement;
 * this only decides what's shown. If you widen one side, widen the other.
 */
type NavItem = { href: string; label: string; Icon: LucideIcon; alert?: boolean; staff?: boolean };
type NavRow = { section: string } | NavItem;

const NAV: NavRow[] = [
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
  { section: 'Customers & sales' },
  { href: '/customers', label: 'Customers', Icon: Users, staff: true },
  { href: '/leads', label: 'Leads', Icon: Mail, alert: true },
  { href: '/price-book', label: 'Price book', Icon: Tags },
  { href: '/inventory', label: 'Inventory', Icon: Boxes },
  { href: '/loyalty', label: 'Loyalty', Icon: Gift },
  { href: '/referrals', label: 'Referrals', Icon: Share2 },
  { href: '/pos', label: 'Point of sale', Icon: ScanLine },
  { section: 'Settings' },
  { href: '/settings/custom-fields', label: 'Custom fields', Icon: SlidersHorizontal },
  { href: '/settings/webhooks', label: 'Webhooks', Icon: Webhook },
  { href: '/settings/integrations', label: 'Integrations', Icon: Blocks },
];

/**
 * Drop everything an employee can't open, then drop any section heading left with nothing under it —
 * otherwise a worker sees "Customers & sales" sitting above empty space.
 */
function navFor(role: 'OWNER' | 'STAFF'): NavRow[] {
  if (role === 'OWNER') return NAV;
  const allowed = NAV.filter((r) => 'section' in r || r.staff);
  return allowed.filter((row, i) => {
    if (!('section' in row)) return true;
    const next = allowed[i + 1];
    return next !== undefined && !('section' in next);
  });
}

export function Sidebar({ role = 'OWNER' }: { role?: 'OWNER' | 'STAFF' }) {
  const path = usePathname();
  const isActive = (href: string) => (href === '/' ? path === '/' : path.startsWith(href));
  const nav = navFor(role);
  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="dot">
          <Layers3 size={18} />
        </span>
        <div>
          <div className="brand-name">OneStack</div>
          <div className="brand-sub">Panel &amp; Paint</div>
        </div>
      </div>
      <nav className="nav">
        {nav.map((item, i) =>
          'section' in item ? (
            <div key={i} className="nav-section">
              {item.section}
            </div>
          ) : (
            <Link key={item.href} href={item.href} className={isActive(item.href) ? 'active' : ''}>
              <span className="ico">
                <item.Icon size={18} />
              </span>
              {item.label}
              {item.alert && <span className="chev">●</span>}
            </Link>
          ),
        )}
      </nav>
      <div className="sidebar-foot">
        <ThemeToggle />
        <span className="foot-item">
          <span className="ico">
            <LifeBuoy size={18} />
          </span>
          Help center
        </span>
      </div>
    </aside>
  );
}
