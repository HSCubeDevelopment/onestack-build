import './globals.css';
import type { Metadata, Viewport } from 'next';
import { cookies } from 'next/headers';
import { MobileTabBar } from '@/components/MobileTabBar';
import { Sidebar } from '@/components/Sidebar';
import { Topbar } from '@/components/Topbar';
import { themeInitScript } from '@/components/ThemeToggle';
import { SESSION_COOKIE, decodeToken } from '@/lib/session';

export const metadata: Metadata = {
  title: 'OneStack — Panel & Paint',
  description: 'Workshop floor and front desk, on your phone.',
  manifest: '/manifest.webmanifest',
  // Card 303: the shop installs this to the home screen, so it must present as an app rather than a
  // bookmarked page — no browser chrome, its own icon, and the navy status bar from the prototype.
  applicationName: 'OneStack',
  appleWebApp: {
    capable: true,
    title: 'OneStack',
    // 'default' would leave a white status bar above a navy header. Translucent lets our own colour
    // run to the top edge, which is what makes it stop looking like a web page.
    statusBarStyle: 'black-translucent',
  },
  formatDetection: { telephone: false },
  icons: {
    icon: [
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/icon-192.png', sizes: '192x192', type: 'image/png' }],
  },
};

/**
 * viewport-fit=cover lets the app paint into the notch and home-indicator areas; the CSS then pads
 * content back with env(safe-area-inset-*). Without cover, iOS letterboxes the app with white bars
 * and the illusion breaks immediately.
 */
export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#0F2340' },
    { media: '(prefers-color-scheme: dark)', color: '#0b1220' },
  ],
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  // Locked: a double-tap zoom on a workshop floor, with gloves on, is always an accident.
  maximumScale: 1,
  userScalable: false,
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
          <MobileTabBar role={role} />
        </div>
      </body>
    </html>
  );
}
