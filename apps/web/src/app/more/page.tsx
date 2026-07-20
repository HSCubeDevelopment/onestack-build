'use client';

import Link from 'next/link';
import { PageHead } from '@/components/ui';
import {
  Boxes,
  CalendarDays,
  ChevronRight,
  ClipboardList,
  Clock,
  Car,
  Gift,
  Inbox,
  ListChecks,
  Plug,
  ScanBarcode,
  Share2,
  SlidersHorizontal,
  Tags,
  UsersRound,
  Webhook,
} from 'lucide-react';

/**
 * The "More" page — everything the bottom tab bar has no room for.
 *
 * This is NOT decoration. On a phone the sidebar is hidden, and the tab bar holds five
 * destinations, so without this page a dozen sections (calendar, fleet, inventory, price book,
 * settings…) would be completely unreachable on the device the shop actually uses. It is the
 * mobile equivalent of the sidebar, and it deliberately lists every section the sidebar does.
 *
 * Grouped in the same order as the sidebar so muscle memory transfers between desktop and phone.
 */

type Item = { href: string; label: string; hint: string; Icon: typeof Inbox };

const GROUPS: { title: string; items: Item[] }[] = [
  {
    title: 'Workshop',
    items: [
      {
        href: '/board',
        label: 'Job board',
        hint: 'Drag jobs through the workshop',
        Icon: ListChecks,
      },
      { href: '/calendar', label: 'Calendar', hint: 'Bookings and resourcing', Icon: CalendarDays },
      { href: '/waitlist', label: 'Waitlist', hint: 'Who is waiting on a slot', Icon: Inbox },
      { href: '/roster', label: 'Roster', hint: 'Who is on today', Icon: UsersRound },
      { href: '/time-clock', label: 'Time clock', hint: 'Clock in and out', Icon: Clock },
    ],
  },
  {
    title: 'Fleet & courtesy cars',
    items: [
      { href: '/fleet', label: 'Fleet & cars', hint: 'Courtesy vehicles', Icon: Car },
      {
        href: '/fleet/bookings',
        label: 'Fleet bookings',
        hint: 'Who has which car',
        Icon: ClipboardList,
      },
    ],
  },
  {
    title: 'Customers & sales',
    items: [
      { href: '/leads', label: 'Leads', hint: 'Enquiries not yet booked', Icon: Tags },
      {
        href: '/price-book',
        label: 'Price book',
        hint: 'Rates and parts pricing',
        Icon: ScanBarcode,
      },
      { href: '/inventory', label: 'Inventory', hint: 'Stock on hand', Icon: Boxes },
      { href: '/loyalty', label: 'Loyalty', hint: 'Rewards and gift cards', Icon: Gift },
      { href: '/referrals', label: 'Referrals', hint: 'Who sent who', Icon: Share2 },
      { href: '/pos', label: 'Point of sale', hint: 'Counter sales', Icon: ScanBarcode },
    ],
  },
  {
    title: 'Settings',
    items: [
      {
        href: '/settings/custom-fields',
        label: 'Custom fields',
        hint: 'Fields for your shop',
        Icon: SlidersHorizontal,
      },
      {
        href: '/settings/integrations',
        label: 'Integrations',
        hint: 'Connected services',
        Icon: Plug,
      },
      { href: '/settings/webhooks', label: 'Webhooks', hint: 'Outbound events', Icon: Webhook },
    ],
  },
];

export default function MorePage() {
  return (
    <>
      <PageHead title="More" sub="Everything that doesn’t fit in the tab bar" />

      <div className="stack">
        {GROUPS.map((group) => (
          <section key={group.title} className="card">
            <h2 className="more-group">{group.title}</h2>
            <div className="more-list">
              {group.items.map(({ href, label, hint, Icon }) => (
                <Link key={href} href={href} className="more-row">
                  <span className="more-icon" aria-hidden>
                    <Icon size={18} strokeWidth={2} />
                  </span>
                  <span className="more-text">
                    <span className="more-label">{label}</span>
                    <span className="more-hint">{hint}</span>
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
