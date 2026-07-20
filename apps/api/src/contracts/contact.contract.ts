import { z } from 'zod';
import type { ContactView } from '../contacts/contacts.service';

/** The public shape of a Contact as it crosses the API/module boundary. */
export const ContactContract = z.object({
  id: z.string().uuid(),
  displayName: z.string().min(1),
  email: z.string().email().nullable(),
  phone: z.string().nullable(),
  /** Postal address (card 10.1). Core, not pack-specific — every vertical's customer has one. */
  address: z
    .object({
      line1: z.string().optional(),
      line2: z.string().optional(),
      suburb: z.string().optional(),
      state: z.string().optional(),
      postcode: z.string().optional(),
      country: z.string().optional(),
    })
    .nullable(),
  fields: z.record(z.unknown()),
  customFields: z.record(z.unknown()),
  createdAt: z.date(),
});
export type ContactContractType = z.infer<typeof ContactContract>;

// Compile-time guard: the Zod contract and the service's ContactView must stay in lockstep.
// If either drifts, this stops type-checking (a second, structural gate on top of the runtime test).
type Assert<A, B> = A extends B ? (B extends A ? true : never) : never;
export const _contactContractMatchesView: Assert<ContactContractType, ContactView> = true;
