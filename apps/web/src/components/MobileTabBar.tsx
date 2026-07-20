'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Briefcase, Home, KanbanSquare, MoreHorizontal, Users } from 'lucide-react';

/**
 * Card 303 — the bottom tab bar, shown only on phones.
 *
 * This is the single thing that most decides whether an installed web app reads as an app or as a
 * website. A sidebar behind a hamburger is a website; a fixed bottom bar with five destinations under
 * the thumb is an app. The five here are the prototype's own tabs, not a guess.
 *
 * Hidden at >=900px, where the sidebar takes over — so the desktop admin is untouched.
 */

/**
 * The five destinations. These are the app's REAL routes — the prototype's tab labels included a
 * "Quote" tab, but the web app has no /quotes index (only /quotes/[id]), so pointing a tab at it
 * gave a dead 404. The board is the screen this shop lives in, so it takes that slot instead.
 */
const TABS = [
  { href: '/', label: 'Home', Icon: Home },
  { href: '/board', label: 'Board', Icon: KanbanSquare },
  { href: '/jobs', label: 'Jobs', Icon: Briefcase },
  { href: '/customers', label: 'People', Icon: Users },
  { href: '/more', label: 'More', Icon: MoreHorizontal },
] as const;

/**
 * An employee sees their own jobs, not the whole-shop board (card #12) — the API returns 403 for it,
 * so showing the tab would only offer them a door that slams. They keep the other four.
 */
const STAFF_TABS = TABS.filter((t) => t.href !== '/board');

export function MobileTabBar({ role }: { role: 'OWNER' | 'STAFF' }) {
  const pathname = usePathname();
  const tabs = role === 'STAFF' ? STAFF_TABS : TABS;

  // The sign-in screen is not part of the shell — a tab bar over a login form looks broken.
  if (pathname?.startsWith('/login')) return null;

  return (
    <nav className="tabbar" aria-label="Primary">
      {tabs.map(({ href, label, Icon }) => {
        // Exact match for root, prefix match elsewhere, so /jobs/123 still lights up "Jobs".
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
    </nav>
  );
}
