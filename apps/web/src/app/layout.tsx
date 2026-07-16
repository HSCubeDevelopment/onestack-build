import './globals.css';
import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { Sidebar } from '@/components/Sidebar';
import { Topbar } from '@/components/Topbar';
import { themeInitScript } from '@/components/ThemeToggle';
import { SESSION_COOKIE, decodeToken } from '@/lib/session';

export const metadata: Metadata = {
  title: 'OneStack — Panel & Paint',
  description: 'OneStack enterprise dashboard',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Read the caller's role server-side and hand it to the (client) Sidebar, so an employee is never
  // shown a link the API would refuse. The API is the enforcement; this is just what we render.
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  const role = (token ? decodeToken(token)?.role : undefined) === 'STAFF' ? 'STAFF' : 'OWNER';
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        <div className="app">
          <Sidebar role={role} />
          <div className="content">
            <Topbar />
            <main className="main">{children}</main>
          </div>
        </div>
      </body>
    </html>
  );
}
