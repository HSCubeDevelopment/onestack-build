'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { MoreHorizontal, Plus } from 'lucide-react';
import { navFor, type NavItem } from '@/lib/nav';
import { INOUT_TABS } from '@/lib/inout';

/**
 * The bottom tab bar, shown only on phones.
 *
 * This is the single thing that most decides whether an installed web app reads as an app or as a
 * website. A sidebar behind a hamburger is a website; a fixed bar with a handful of destinations under
 * the thumb is an app.
 *
 * The destinations are DERIVED from `navFor(role)` rather than hand-listed. An earlier version had its
 * own list and put Dashboard in the first slot for everyone — but Dashboard is owner-only, so an
 * employee's home tab led straight to a screen whose every API call returns 403. Deriving from the same
 * list the sidebar uses means the tab bar cannot offer a door the server will slam.
 *
 * Hidden at >=900px, where the sidebar takes over, so the desktop admin is untouched.
 */

/** Preferred order for the first four slots. Anything not allowed for the role is skipped. */
const PREFERRED = ['/', '/board', '/jobs', '/customers', '/roster', '/time-clock'];

export function MobileTabBar({
  role,
  canViewFinance = false,
}: {
  role: 'OWNER' | 'STAFF' | 'TOW';
  canViewFinance?: boolean;
}) {
  const pathname = usePathname();

  // The sign-in screen is not part of the shell — a tab bar over a login form looks broken.
  if (pathname?.startsWith('/login')) return null;

  // Shop-floor STAFF get the In N Out tab bar: Home · Cars · ＋ · Today · Search. OWNER and TOW are
  // left on the OneStack-derived tabs below.
  if (role === 'STAFF') {
    const isOn = (href: string) => (href === '/' ? pathname === '/' : pathname?.startsWith(href));
    return (
      <nav className="tabbar" aria-label="Primary">
        {INOUT_TABS.slice(0, 2).map(({ href, label, Icon }) => (
          <Link key={href} href={href} className={`tabbar-item${isOn(href) ? ' is-active' : ''}`}>
            <Icon size={22} strokeWidth={isOn(href) ? 2.4 : 1.9} aria-hidden />
            <span>{label}</span>
          </Link>
        ))}
        <Link href="/inout/add" className="tabbar-item" aria-label="Quick add">
          <span
            style={{
              width: 44,
              height: 44,
              marginTop: -8,
              borderRadius: '50%',
              background: 'var(--brand)',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 14px rgba(0,0,0,0.22)',
            }}
          >
            <Plus size={26} strokeWidth={2.6} aria-hidden />
          </span>
        </Link>
        {INOUT_TABS.slice(2).map(({ href, label, Icon }) => (
          <Link key={href} href={href} className={`tabbar-item${isOn(href) ? ' is-active' : ''}`}>
            <Icon size={22} strokeWidth={isOn(href) ? 2.4 : 1.9} aria-hidden />
            <span>{label}</span>
          </Link>
        ))}
      </nav>
    );
  }

  const allowed = navFor(role, { canViewFinance }).filter((r): r is NavItem => !('section' in r));
  const byHref = new Map(allowed.map((r) => [r.href, r]));

  // Four from the preferred order, then More — five is the most a thumb reaches comfortably.
  const tabs = PREFERRED.map((h) => byHref.get(h))
    .filter((r): r is NavItem => r !== undefined)
    .slice(0, 4);

  return (
    <nav className="tabbar" aria-label="Primary">
      {tabs.map(({ href, label, Icon }) => {
        // Exact match for root, prefix elsewhere, so /jobs/123 still lights up "Jobs".
        const active = href === '/' ? pathname === '/' : pathname?.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={`tabbar-item${active ? ' is-active' : ''}`}
            aria-current={active ? 'page' : undefined}
          >
            <Icon size={22} strokeWidth={active ? 2.4 : 1.9} aria-hidden />
            <span>{label}</span>
          </Link>
        );
      })}

      <Link
        href="/more"
        className={`tabbar-item${pathname === '/more' ? ' is-active' : ''}`}
        aria-current={pathname === '/more' ? 'page' : undefined}
      >
        <MoreHorizontal size={22} strokeWidth={pathname === '/more' ? 2.4 : 1.9} aria-hidden />
        <span>More</span>
      </Link>
    </nav>
  );
}
