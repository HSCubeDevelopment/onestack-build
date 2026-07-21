import { z } from 'zod';
import { Pack } from '../../core/pack-contract';

/**
 * The AUTOMOTIVE pack (panel & paint) — the first test vertical. It is pure CONFIG on the generic core:
 * Customer = Contact, Vehicle = a Subject type, Job = a Work Item type + workflow, Quote/Invoice =
 * documents. No vertical noun lives in the core; installing this pack makes the platform "feel" automotive.
 */

// Australian rego: up to 7 alphanumerics. VIN: 17 chars, excluding I/O/Q.
const rego = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9]{1,7}$/, 'Rego must be up to 7 letters/numbers');
const vin = z
  .string()
  .trim()
  .regex(/^[A-HJ-NPR-Za-hj-npr-z0-9]{17}$/, 'VIN must be 17 characters (no I, O or Q)')
  .optional();

/**
 * Paint code — the manufacturer's colour identifier stamped on the compliance plate (e.g. '1G3', 'PXR').
 * Card 10.1: a panel shop needs it to mix paint, and it is the one vehicle detail that cannot be looked
 * up from the rego. Free-form because the format varies by manufacturer; trimmed and length-capped only.
 */
const paintCode = z.string().trim().min(1).max(20).optional();

export const VehicleFields = z.object({
  rego,
  vin,
  paintCode,
  make: z.string().min(1),
  model: z.string().min(1),
  year: z.number().int().gte(1900).lte(2100),
});

/**
 * Insurance claim block on a job (card #15). Most panel-shop jobs are insurer-driven: the party billed
 * (insurer) differs from the party served (customer), who pays only the excess. The generic money model
 * (core #40.5 payer + split billing) carries the actual invoice split; THIS is the automotive-specific
 * paperwork captured on the job — insurer, claim number, assessor, the AUTHORISED amount (which can
 * differ from the quote), and the customer excess. All optional so a cash/retail job needs none of it.
 */
export const ClaimFields = z.object({
  insurer: z.string().min(1),
  insurerContactId: z.string().uuid().optional(), // the Contact billed for the authorised portion
  claimNumber: z.string().min(1),
  assessor: z.string().optional(),
  dateLodged: z.string().optional(),
  authorisedAmountCents: z.number().int().nonnegative().optional(), // assessor-approved (≠ quote)
  excessCents: z.number().int().nonnegative().optional(), // customer's out-of-pocket
  billPayer: z.enum(['insurer', 'customer']).default('insurer'),
});

export const automotivePack: Pack = {
  id: 'automotive',
  label: 'Automotive Panel & Paint',
  terminology: {
    work_item: { label: 'Job', plural: 'Jobs' },
    contact: { label: 'Customer', plural: 'Customers' },
    subject: { label: 'Vehicle', plural: 'Vehicles' },
  },
  subjectTypes: [{ type: 'vehicle', label: 'Vehicle', fields: VehicleFields }],
  workItemTypes: [
    {
      type: 'job',
      label: 'Job',
      referencePrefix: 'J', // J-000001
      requiresSubject: true, // a repair needs a car
      fields: z.object({
        customerId: z.string().uuid(),
        description: z.string().optional(),
        bookedInDate: z.string().optional(),
        promisedDate: z.string().optional(),
        completedDate: z.string().optional(),
        claim: ClaimFields.optional(), // present ⇒ insured job (card #15)
        // INS-2: true while a customer-excess portion on the job is still unpaid. Kept in sync by the
        // invoice flow (set when an excess split is applied, cleared when it's paid or an owner waives).
        // The COLLECT guard below reads it. Optional/backward-compatible — a job without it is not held.
        excessOutstanding: z.boolean().optional(),
      }),
      workflow: {
        workItemType: 'job',
        version: 1,
        initial: 'Booked',
        states: {
          Booked: { on: { START: { target: 'InProgress' } } },
          InProgress: {
            on: { AWAIT_PARTS: { target: 'AwaitingParts' }, READY: { target: 'Ready' } },
          },
          AwaitingParts: { on: { RESUME: { target: 'InProgress' } } },
          // INS-2: a car can only be released once the customer's excess is collected (or waived).
          Ready: { on: { COLLECT: { target: 'Collected', guard: 'excessCollected' } } },
          Collected: { final: true },
        },
      },
      // INS-2: the release gate. A job with no excess (excessOutstanding !== true) collects freely; a
      // job still owing an excess is blocked until it's paid or an owner waives the hold. The vertical
      // rule lives HERE in the pack — the core engine only enforces named guards generically.
      guards: {
        excessCollected: (ctx) => ctx.fields.excessOutstanding !== true,
      },
    },
  ],
  documents: [
    {
      key: 'quote',
      label: 'Quote',
      body: 'QUOTE {{ reference }}\nCustomer: {{ customer }}\nTotal: {{ total }}',
    },
    {
      key: 'invoice',
      label: 'Tax Invoice',
      body: 'TAX INVOICE {{ reference }}\nABN {{ abn }}\nCustomer: {{ customer }}\nTotal: {{ total }} (incl GST {{ gst }})',
    },
  ],
};
