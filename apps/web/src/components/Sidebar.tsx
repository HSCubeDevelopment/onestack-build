'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  KanbanSquare,
  Wrench,
  CalendarDays,
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
  type LucideIcon,
} from 'lucide-react';
import { ThemeToggle } from '@/components/ThemeToggle';

type NavItem = { href: string; label: string; Icon: LucideIcon; alert?: boolean };
type NavRow = { section: string } | NavItem;

const NAV: NavRow[] = [
  { section: 'Menu' },
  { href: '/', label: 'Dashboard', Icon: LayoutDashboard },
  { href: '/board', label: 'Job board', Icon: KanbanSquare },
  { href: '/jobs', label: 'Jobs', Icon: Wrench },
  { href: '/calendar', label: 'Calendar', Icon: CalendarDays },
  { href: '/waitlist', label: 'Waitlist', Icon: ListChecks },
  { href: '/roster', label: 'Roster', Icon: CalendarDays },
  { section: 'Customers & sales' },
  { href: '/customers', label: 'Customers', Icon: Users },
  { href: '/leads', label: 'Leads', Icon: Mail, alert: true },
  { href: '/price-book', label: 'Price book', Icon: Tags },
  { href: '/inventory', label: 'Inventory', Icon: Boxes },
  { href: '/loyalty', label: 'Loyalty', Icon: Gift },
  { href: '/referrals', label: 'Referrals', Icon: Share2 },
  { section: 'Settings' },
  { href: '/settings/custom-fields', label: 'Custom fields', Icon: SlidersHorizontal },
];

export function Sidebar() {
  const path = usePathname();
  const isActive = (href: string) => (href === '/' ? path === '/' : path.startsWith(href));
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
        {NAV.map((item, i) =>
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
