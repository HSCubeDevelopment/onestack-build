import { z } from 'zod';
import type { Pack } from '../../../src/core/pack-contract';

/**
 * Test-fixture trades pack. A SECOND Subject type (property) defined purely via config — proving the
 * Subject abstraction is generic and pack-typed with no core migration (card #6.4).
 */
export const tradesPack: Pack = {
  id: 'trades',
  label: 'Trades',
  subjectTypes: [
    {
      type: 'property',
      label: 'Property',
      fields: z.object({ address: z.string(), propertyType: z.string() }),
    },
  ],
};
