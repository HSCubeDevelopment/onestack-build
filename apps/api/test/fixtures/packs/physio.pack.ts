import { z } from 'zod';
import type { Pack } from '../../../src/core/pack-contract';

/**
 * Test-fixture physio pack. The SAME Work Item engine runs an "appointment" with a totally different
 * workflow (Scheduled → Completed/Cancelled) and no Subject type (the person is the subject). Proves one
 * engine serves multiple verticals via config alone (cards #6.3 / #6.5).
 */
export const physioPack: Pack = {
  id: 'physio',
  label: 'Physiotherapy',
  workItemTypes: [
    {
      type: 'appointment',
      label: 'Appointment',
      fields: z.object({ notes: z.string().optional() }),
      workflow: {
        workItemType: 'appointment',
        version: 1,
        initial: 'Scheduled',
        states: {
          Scheduled: { on: { COMPLETE: { target: 'Completed' }, CANCEL: { target: 'Cancelled' } } },
          Completed: { final: true },
          Cancelled: { final: true },
        },
      },
    },
  ],
};
