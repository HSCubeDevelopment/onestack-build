// Populate the DEMO tenant with a realistic dataset so the frontend looks alive. Idempotent-ish:
// safe to run once on a fresh demo tenant. Talks to the running API on :3001 with a minted OWNER token.
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';

const SECRET = process.env.SUPABASE_JWT_SECRET!;
const TENANT = '0d15ea5e-0000-4000-8000-000000000001';
const USER = '0d15ea5e-0000-4000-8000-000000000002';
const token = jwt.sign({ sub: USER, tenant_id: TENANT, role: 'OWNER' }, SECRET, { expiresIn: '30m' });
const BASE = 'http://localhost:3001/api/v1';

/** Wipe the demo tenant's data (keep the tenant, its owner membership, and feature flags). */
async function wipe() {
  const db = new PrismaClient();
  try {
    for (const tbl of [
      'onestack_payment', 'onestack_invoice_portion', 'onestack_booking', 'onestack_resource',
      'onestack_line_item', 'onestack_invoice', 'onestack_quote', 'onestack_reference_counter',
      'onestack_work_item_attachment', 'onestack_work_item_note', 'onestack_work_item_subject',
      'onestack_work_item', 'onestack_work_item_counter', 'onestack_subject', 'onestack_lead',
      'onestack_lead_form', 'onestack_custom_field', 'onestack_price_book_item', 'onestack_contact',
    ]) {
      await db.$executeRawUnsafe(`DELETE FROM "${tbl}" WHERE "tenantId" = $1::uuid`, TENANT);
    }
  } finally {
    await db.$disconnect();
  }
}

const call = async (method: string, path: string, body?: unknown) => {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${text}`);
  return text ? JSON.parse(text) : null;
};

async function main() {
  await wipe();
  // Price book
  for (const it of [
    { name: 'Panel labour', type: 'labour', unit: 'hour', defaultUnitPriceCents: 9500, code: 'LAB-PANEL' },
    { name: 'Paint labour', type: 'labour', unit: 'hour', defaultUnitPriceCents: 11000, code: 'LAB-PAINT' },
    { name: 'Front bumper', type: 'part', unit: 'each', defaultUnitPriceCents: 42000, code: 'BUMP-F' },
    { name: 'Headlight assembly', type: 'part', unit: 'each', defaultUnitPriceCents: 68000, code: 'HL-01' },
  ]) await call('POST', '/price-book', it);

  // A couple of custom fields
  await call('POST', '/custom-fields', { appliesTo: 'customer', key: 'preferred_contact', label: 'Preferred contact', type: 'select', options: ['Phone', 'Email', 'SMS'] });
  await call('POST', '/custom-fields', { appliesTo: 'vehicle', key: 'colour', label: 'Colour', type: 'text' });

  // Resources
  const bay1 = await call('POST', '/resources', { type: 'bay', name: 'Bay 1' });
  const bay2 = await call('POST', '/resources', { type: 'bay', name: 'Bay 2' });
  const tech = await call('POST', '/resources', { type: 'technician', name: 'Dave' });
  const resources = [bay1, bay2, tech];

  // Insurer
  const insurer = await call('POST', '/contacts', { displayName: 'AAMI Insurance', phone: '0132244' });

  const customers = [
    { name: 'Jane Motorist', phone: '0400123456', email: 'jane@example.com', rego: 'ABC123', make: 'Mazda', model: 'CX-5', year: 2021, target: 'InProgress', insured: true },
    { name: 'Tom Nguyen', phone: '0400222333', email: 'tom@example.com', rego: 'XYZ789', make: 'Toyota', model: 'Corolla', year: 2019, target: 'Ready', insured: false },
    { name: 'Priya Sharma', phone: '0400555666', email: 'priya@example.com', rego: 'JKL456', make: 'Hyundai', model: 'i30', year: 2022, target: 'Booked', insured: false },
    { name: 'Metro Fleet Pty Ltd', phone: '0398765432', email: 'ops@metrofleet.com', rego: 'FLT001', make: 'Ford', model: 'Ranger', year: 2023, target: 'AwaitingParts', insured: true },
  ];

  const createdJobs: any[] = [];
  for (const c of customers) {
    const contact = await call('POST', '/contacts', { displayName: c.name, phone: c.phone, email: c.email });
    const vehicle = await call('POST', `/contacts/${contact.id}/vehicles`, { rego: c.rego, make: c.make, model: c.model, year: c.year });
    const claim = c.insured
      ? { insurer: 'AAMI', insurerContactId: insurer.id, claimNumber: `CLM-${c.rego}`, authorisedAmountCents: 12300, excessCents: 2000, billPayer: 'insurer' }
      : undefined;
    const job = await call('POST', '/work-items', {
      type: 'job',
      subjectIds: [vehicle.id],
      fields: { customerId: contact.id, description: `${c.make} ${c.model} — repair`, ...(claim ? { claim } : {}) },
    });
    createdJobs.push({ job, label: `${c.make} ${c.model} — ${c.name.split(' ')[0]}` });

    // Quote with lines
    const quote = await call('POST', `/work-items/${job.id}/quotes`);
    await call('POST', `/quotes/${quote.id}/lines`, { description: 'Panel labour', type: 'labour', quantity: 2, unitPriceCents: 9500 });
    await call('POST', `/quotes/${quote.id}/lines`, { description: 'Front bumper', type: 'part', quantity: 1, unitPriceCents: 3000 });
    await call('POST', `/quotes/${quote.id}/status`, { status: 'Sent' });
    await call('POST', `/quotes/${quote.id}/status`, { status: 'Accepted' });
    const inv = await call('POST', `/quotes/${quote.id}/invoice`, {});

    // A note
    await call('POST', `/work-items/${job.id}/notes`, { body: 'Customer dropped the car off; keys in lockbox.' });

    // Move the job to its target state
    const path: Record<string, string[]> = {
      Booked: [],
      InProgress: ['START'],
      AwaitingParts: ['START', 'AWAIT_PARTS'],
      Ready: ['START', 'READY'],
      Collected: ['START', 'READY', 'COLLECT'],
    };
    for (const ev of path[c.target]) await call('POST', `/work-items/${job.id}/transition`, { event: ev });

    // For the first insured job, apply the excess split + take the customer's excess payment
    if (c.name === 'Jane Motorist') {
      const excessCents = 2000;
      const authorised = inv.totalCents - excessCents; // reconcile to the real invoice total
      await call('POST', `/invoices/${inv.id}/excess-split`, { primaryPayerContactId: insurer.id, primaryAmountCents: authorised, excessAmountCents: excessCents, excessPayerContactId: contact.id });
      const full = await call('GET', `/invoices/${inv.id}`);
      const excess = full.portions.find((p: any) => p.payerContactId === contact.id);
      await call('POST', `/invoices/${inv.id}/payments`, { amountCents: excessCents, method: 'card', portionId: excess.id });
    }
    if (c.name === 'Tom Nguyen') {
      await call('POST', `/invoices/${inv.id}/mark-paid`);
    }
  }

  // Calendar bookings over the next few days (so "Upcoming events" is populated).
  const day = 864e5;
  const now = Date.now();
  const at = (offsetDays: number, hour: number) => {
    const d = new Date(now + offsetDays * day);
    d.setHours(hour, 0, 0, 0);
    return d.toISOString();
  };
  const bookings = [
    { title: 'Lease renewal — strip down', res: 0, offset: 0, hour: 9, job: 0 },
    { title: 'Property tour — assessor visit', res: 1, offset: 1, hour: 11, job: 3 },
    { title: 'Panel fit — Corolla', res: 2, offset: 1, hour: 14, job: 1 },
    { title: 'Collection — Hyundai i30', res: 0, offset: 3, hour: 10, job: 2 },
    { title: 'Paint booth — Ranger', res: 1, offset: 4, hour: 13, job: 3 },
  ];
  for (const b of bookings) {
    await call('POST', '/bookings', {
      resourceId: resources[b.res].id,
      title: b.title,
      startsAt: at(b.offset, b.hour),
      endsAt: at(b.offset, b.hour + 2),
      workItemId: createdJobs[b.job]?.job.id,
    });
  }

  // Leads: a public form + a couple of submissions
  const form = await call('POST', '/lead-forms', { name: 'Website enquiry' });
  await call('POST', `/public/lead-forms/${form.publicToken}/submit`, { name: 'Sam Carter', phone: '0400999888', message: 'Scratched my rear door, need a quote', vehicleInfo: 'Kia Sportage 2020' });
  await call('POST', `/public/lead-forms/${form.publicToken}/submit`, { name: 'Lena Cruz', phone: '0400111222', email: 'lena@example.com', message: 'Hail damage on the bonnet' });

  console.log('✅ Demo data populated.');
}
main().catch((e) => { console.error(e); process.exit(1); });
