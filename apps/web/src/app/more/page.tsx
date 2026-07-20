'use client';

import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { PageHead } from '@/components/ui';
import { navFor } from '@/lib/nav';
import { useRole } from '@/lib/use-role';

/**
 * The "More" page — everything the bottom tab bar has no room for.
 *
 * This is NOT decoration. On a phone the sidebar is hidden and the tab bar holds five destinations, so
 * without this page a dozen sections would be unreachable on the device the shop actually uses. It is
 * the mobile equivalent of the sidebar.
 *
 * It renders from the SAME `navFor(role)` the sidebar uses. The first version carried its own
 * hand-written list, which meant it offered an employee the price book, the POS and the settings
 * screens — every one of which the API answers with 403 — and showed the off-wedge retail screens
 * card #300 exists to hide. Deriving both surfaces from one list makes that class of drift impossible.
 */
export default function MorePage() {
  const { role } = useRole();

  // Until the role resolves, show nothing rather than a flash of owner-only links a worker should
  // never see. use-role falls back to STAFF on failure, so the safe case is also the default.
  if (!role) return <PageHead title="More" sub="Everything that doesn’t fit in the tab bar" />;

  const rows = navFor(role);
  const groups: { title: string; items: Extract<(typeof rows)[number], { href: string }>[] }[] = [];
  for (const row of rows) {
    if ('section' in row) groups.push({ title: row.section, items: [] });
    else groups[groups.length - 1]?.items.push(row);
  }

  return (
    <>
      <PageHead title="More" sub="Everything that doesn’t fit in the tab bar" />

      <div className="stack">
        {groups.map((group) => (
          <section key={group.title} className="card">
            <h2 className="more-group">{group.title}</h2>
            <div className="more-list">
              {group.items.map(({ href, label, Icon }) => (
                <Link key={href} href={href} className="more-row">
                  <span className="more-icon" aria-hidden>
                    <Icon size={18} strokeWidth={2} />
                  </span>
                  <span className="more-text">
                    <span className="more-label">{label}</span>
                  </span>
                  <ChevronRight size={18} className="more-chev" aria-hidden />
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
