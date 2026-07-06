'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV = [
  { section: 'Menu' },
  { href: '/', label: 'Dashboard', ico: '▦' },
  { href: '/board', label: 'Job board', ico: '🗂' },
  { href: '/jobs', label: 'Jobs', ico: '🔧' },
  { href: '/calendar', label: 'Calendar', ico: '📅' },
  { section: 'Customers & sales' },
  { href: '/customers', label: 'Customers', ico: '👥' },
  { href: '/leads', label: 'Leads', ico: '✉', chev: true },
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
        <span className="dot">◈</span>
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
            <Link key={item.href} href={item.href!} className={isActive(item.href!) ? 'active' : ''}>
              <span className="ico">{item.ico}</span>
              {item.label}
              {item.chev && <span className="chev">●</span>}
            </Link>
          ),
        )}
      </nav>
      <div className="sidebar-foot">
        <Link href="/" className="nav-foot">
          <span style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '9px 12px', color: 'var(--text-dim)', fontSize: 13.5, fontWeight: 550 }}>
            <span className="ico">🌙</span> Dark mode
          </span>
        </Link>
        <span style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '9px 12px', color: 'var(--text-dim)', fontSize: 13.5, fontWeight: 550 }}>
          <span className="ico">❔</span> Help center
        </span>
      </div>
    </aside>
  );
}
