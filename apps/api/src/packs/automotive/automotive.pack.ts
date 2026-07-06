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

export const VehicleFields = z.object({
  rego,
  vin,
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
          Ready: { on: { COLLECT: { target: 'Collected' } } },
          Collected: { final: true },
        },
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
