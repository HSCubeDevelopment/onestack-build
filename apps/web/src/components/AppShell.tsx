'use client';
import { usePathname } from 'next/navigation';
import { MobileTabBar } from '@/components/MobileTabBar';
import { Sidebar } from '@/components/Sidebar';
import { Topbar } from '@/components/Topbar';

/**
 * The app chrome around a page.
 *
 * Three surfaces:
 *  - /login renders on its own, full-bleed (app nav around a sign-in form reads as broken).
 *  - STAFF and TOW get the Auto Tech phone surface: a centred, iOS-styled mobile column with NO
 *    sidebar/topbar/tab bar. Navigation lives inside the pages (big buttons + back), matching the
 *    AutoTech_TwoButton demo. `.at-shell` re-skins the design tokens to iOS for everything inside it,
 *    so a tow worker's shared screens (/jobs, /yards, /time-clock) adopt the same look with no change
 *    to their functionality.
 *  - OWNER keeps the full OneStack admin (sidebar + topbar + tab bar), untouched.
 *
 * Client component only so it can read the pathname; the role still comes from the server layout,
 * which decoded it from the session cookie.
 */
export function AppShell({
  role,
  canViewFinance = false,
  children,
}: {
  role: 'OWNER' | 'STAFF' | 'TOW';
  canViewFinance?: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  if (pathname?.startsWith('/login')) {
    return <div className="auth-page">{children}</div>;
  }

  // Employees (shop-floor staff + tow drivers) get the Auto Tech phone surface.
  if (role === 'STAFF' || role === 'TOW') {
    return (
      <div className="at-shell">
        <div className="at-frame">{children}</div>
      </div>
    );
  }

  return (
    <div className="app">
      <Sidebar role={role} canViewFinance={canViewFinance} />
      <div className="content">
        <Topbar />
        <main className="main">{children}</main>
      </div>
      <MobileTabBar role={role} canViewFinance={canViewFinance} />
    </div>
  );
}
