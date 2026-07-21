'use client';
import { usePathname } from 'next/navigation';
import { MobileTabBar } from '@/components/MobileTabBar';
import { Sidebar } from '@/components/Sidebar';
import { Topbar } from '@/components/Topbar';

/**
 * The app chrome — sidebar, topbar, bottom tab bar — around a page.
 *
 * Everything EXCEPT the sign-in screen. A login form framed by the app's own navigation reads as
 * broken, and worse, that navigation dangles links (Jobs, Board, Customers…) a signed-out visitor
 * can't actually use. On /login we render the page on its own, full-bleed.
 *
 * This is a client component only so it can read the pathname; the role still comes from the server
 * layout, which decoded it from the session cookie.
 */
export function AppShell({
  role,
  canViewFinance = false,
  children,
}: {
  role: 'OWNER' | 'STAFF';
  canViewFinance?: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  if (pathname?.startsWith('/login')) {
    return <div className="auth-page">{children}</div>;
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
