'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV = [
  { section: 'Workshop' },
  { href: '/', label: 'Dashboard', ico: '◱' },
  { href: '/board', label: 'Job board', ico: '▦' },
  { href: '/jobs', label: 'Jobs', ico: '🔧' },
  { href: '/calendar', label: 'Calendar', ico: '📅' },
  { section: 'Customers & sales' },
  { href: '/customers', label: 'Customers', ico: '👤' },
  { href: '/leads', label: 'Leads', ico: '✉' },
  { href: '/price-book', label: 'Price book', ico: '🏷' },
  { section: 'Settings' },
  { href: '/settings/custom-fields', label: 'Custom fields', ico: '⚙' },
];

export function Sidebar() {
  const path = usePathname();
  const isActive = (href: string) => (href === '/' ? path === '/' : path.startsWith(href));
  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="dot" />
        OneStack
      </div>
      <nav className="nav">
        {NAV.map((item, i) =>
          'section' in item ? (
            <div key={i} className="nav-section">
              {item.section}
            </div>
          ) : (
            <Link key={item.href} href={item.href!} className={isActive(item.href!) ? 'active' : ''}>
              <span className="ico">{item.ico}</span>
              {item.label}
            </Link>
          ),
        )}
      </nav>
      <div style={{ padding: '18px 10px', color: 'var(--text-faint)', fontSize: 11 }}>
        <div className="divider" style={{ marginBottom: 12 }} />
        Demo tenant · Owner
        <br />
        Panel &amp; Paint
      </div>
    </aside>
  );
}
