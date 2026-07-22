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
import { navFor, type NavRow } from '@/lib/nav';
import { INOUT_TABS } from '@/lib/inout';
import { Plus } from 'lucide-react';

// Shop-floor STAFF get the In N Out destinations (matching their tab bar); OWNER/TOW keep the app nav.
const INOUT_SIDEBAR: NavRow[] = [
  { section: 'In N Out' },
  ...INOUT_TABS,
  { href: '/inout/add', label: 'New movement', Icon: Plus },
];

export function Sidebar({
  role = 'OWNER',
  canViewFinance = false,
}: {
  role?: 'OWNER' | 'STAFF' | 'TOW';
  canViewFinance?: boolean;
}) {
  const path = usePathname();
  const isActive = (href: string) => (href === '/' ? path === '/' : path.startsWith(href));
  const nav = role === 'STAFF' ? INOUT_SIDEBAR : navFor(role, { canViewFinance });
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
