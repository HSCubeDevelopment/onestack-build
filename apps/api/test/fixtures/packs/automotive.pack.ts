import { z } from 'zod';
import type { Pack } from '../../../src/core/pack-contract';

/**
 * Test-fixture automotive pack. Proves the Pack Contract (card #6.1): it adds a Subject type (vehicle),
 * a Work Item type (job) with its own workflow — including a status the core doesn't know (AwaitingParts)
 * — and a document (quote) the core has no knowledge of. It imports ONLY the pack contract + zod.
 */
export const automotivePack: Pack = {
  id: 'automotive',
  label: 'Automotive',
  subjectTypes: [
    {
      type: 'vehicle',
      label: 'Vehicle',
      fields: z.object({
        rego: z.string(),
        vin: z.string().optional(),
        make: z.string(),
        model: z.string(),
        year: z.number().int(),
      }),
    },
  ],
  workItemTypes: [
    {
      type: 'job',
      label: 'Job',
      fields: z.object({ description: z.string().optional(), paid: z.boolean().default(false) }),
      workflow: {
        workItemType: 'job',
        version: 1,
        initial: 'Booked',
        states: {
          Booked: { on: { START: { target: 'InProgress' } } },
          InProgress: {
            on: { AWAIT_PARTS: { target: 'AwaitingParts' }, READY: { target: 'Ready' } },
          },
          AwaitingParts: { on: { RESUME: { target: 'InProgress' } } }, // status the core doesn't know
          Ready: {
            on: { COLLECT: { target: 'Collected', guard: 'isPaid', actions: ['notifyCollected'] } },
          },
          Collected: { final: true },
        },
      },
      guards: { isPaid: (ctx) => ctx.fields.paid === true },
    },
  ],
  documents: [{ key: 'quote', label: 'Quote', body: 'Quote for {{reference}}' }],
};
