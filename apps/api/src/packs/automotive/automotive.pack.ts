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
      fields: z.object({ description: z.string().optional() }),
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
