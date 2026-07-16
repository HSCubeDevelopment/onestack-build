/**
 * Integration marketplace catalogue — a code registry (Phase 4, card #253). Vendor-free: this is just the
 * list of integrations a tenant can browse and connect. Each entry's actual vendor wiring (OAuth/API) is a
 * DEFERRED, separate build; connecting here records intent + config only.
 */
export interface CatalogueEntry {
  slug: string;
  name: string;
  category: string;
  description: string;
  /** True once its real vendor wiring is built; false = "coming soon" placeholder. */
  available: boolean;
}

export const CATALOGUE: CatalogueEntry[] = [
  {
    slug: 'xero',
    name: 'Xero',
    category: 'Accounting',
    description: 'Sync invoices and payments to Xero.',
    available: false,
  },
  {
    slug: 'myob',
    name: 'MYOB',
    category: 'Accounting',
    description: 'Sync invoices and payments to MYOB.',
    available: false,
  },
  {
    slug: 'quickbooks',
    name: 'QuickBooks',
    category: 'Accounting',
    description: 'Sync invoices to QuickBooks Online.',
    available: false,
  },
  {
    slug: 'google-reviews',
    name: 'Google Reviews',
    category: 'Reputation',
    description: 'Publish review requests to your Google Business profile.',
    available: false,
  },
  {
    slug: 'mailchimp',
    name: 'Mailchimp',
    category: 'Marketing',
    description: 'Send campaigns via Mailchimp audiences.',
    available: false,
  },
  {
    slug: 'twilio',
    name: 'Twilio',
    category: 'Communications',
    description: 'Send SMS reminders and receptionist calls.',
    available: false,
  },
  {
    slug: 'zapier',
    name: 'Zapier',
    category: 'Automation',
    description: 'Trigger Zaps from OneStack events (via webhooks).',
    available: true,
  },
  {
    slug: 'google-calendar',
    name: 'Google Calendar',
    category: 'Scheduling',
    description: 'Two-way sync of bookings with Google Calendar.',
    available: false,
  },
];

export function catalogueEntry(slug: string): CatalogueEntry | undefined {
  return CATALOGUE.find((c) => c.slug === slug);
}
