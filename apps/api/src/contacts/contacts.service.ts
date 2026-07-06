import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CustomFieldService } from '../custom-fields/custom-field.service';
import { TenantService } from '../tenancy/tenant.service';

export interface ContactView {
  id: string;
  displayName: string;
  email: string | null;
  phone: string | null;
  fields: Record<string, unknown>;
  customFields: Record<string, unknown>;
  createdAt: Date;
}

export interface CreateContactInput {
  displayName: string;
  phone: string;
  email?: string;
  fields?: Record<string, unknown>;
  customFields?: Record<string, unknown>;
}
export interface UpdateContactInput {
  displayName?: string;
  phone?: string;
  email?: string | null;
  fields?: Record<string, unknown>;
  customFields?: Record<string, unknown>;
}

/**
 * Contact is a CORE primitive (the party served) — industry-neutral, no vertical nouns. In the automotive
 * pack it is relabelled "Customer" (terminology layer), and carries custom fields (insurer, excess) in
 * its JSONB `fields`. Every method runs through runInTenant → RLS scopes it to the caller's tenant.
 */
@Injectable()
export class ContactsService {
  constructor(
    private readonly tenants: TenantService,
    private readonly customFields: CustomFieldService,
  ) {}

  async create(tenantId: string, input: CreateContactInput): Promise<ContactView> {
    const customFields = await this.customFields.validateValues(
      tenantId,
      'customer',
      input.customFields ?? {},
    );
    return this.tenants.runInTenant(tenantId, async (tx) => {
      const c = await tx.contact.create({
        data: {
          tenantId,
          displayName: input.displayName,
          phone: input.phone,
          email: input.email ?? null,
          fields: (input.fields ?? {}) as Prisma.InputJsonValue,
          customFields: customFields as Prisma.InputJsonValue,
        },
      });
      return toView(c);
    });
  }

  async get(tenantId: string, id: string): Promise<ContactView> {
    const c = await this.tenants.runInTenant(tenantId, (tx) =>
      tx.contact.findFirst({ where: { id, deletedAt: null } }),
    );
    if (!c) throw new NotFoundException('Contact not found');
    return toView(c);
  }

  async update(tenantId: string, id: string, patch: UpdateContactInput): Promise<ContactView> {
    // Validate custom values against the tenant's ACTIVE definitions before opening the write txn.
    let validatedCustom: Record<string, unknown> | undefined;
    if (patch.customFields !== undefined)
      validatedCustom = await this.customFields.validateValues(
        tenantId,
        'customer',
        patch.customFields,
      );

    return this.tenants.runInTenant(tenantId, async (tx) => {
      const current = await tx.contact.findFirst({ where: { id, deletedAt: null } });
      if (!current) throw new NotFoundException('Contact not found');
      const data: Prisma.ContactUpdateManyMutationInput = {};
      if (patch.displayName !== undefined) data.displayName = patch.displayName;
      if (patch.phone !== undefined) data.phone = patch.phone;
      if (patch.email !== undefined) data.email = patch.email;
      if (patch.fields !== undefined) data.fields = patch.fields as Prisma.InputJsonValue;
      if (validatedCustom !== undefined) {
        // Merge over the existing bag so values of ARCHIVED fields are preserved (not hard-deleted).
        const merged = { ...(current.customFields as Record<string, unknown>), ...validatedCustom };
        data.customFields = merged as Prisma.InputJsonValue;
      }
      await tx.contact.updateMany({ where: { id, deletedAt: null }, data });
      const c = await tx.contact.findFirst({ where: { id } });
      return toView(c!);
    });
  }

  async softDelete(tenantId: string, id: string): Promise<void> {
    await this.tenants.runInTenant(tenantId, (tx) =>
      tx.contact.updateMany({ where: { id, deletedAt: null }, data: { deletedAt: new Date() } }),
    );
  }

  async list(tenantId: string): Promise<ContactView[]> {
    const rows = await this.tenants.runInTenant(tenantId, (tx) =>
      tx.contact.findMany({ where: { deletedAt: null }, orderBy: { createdAt: 'desc' } }),
    );
    return rows.map(toView);
  }

  /** Search customers by name, phone or email (this tenant only). Card #11. */
  async search(tenantId: string, q: string): Promise<ContactView[]> {
    const term = q.trim();
    if (!term) return [];
    const rows = await this.tenants.runInTenant(tenantId, (tx) =>
      tx.contact.findMany({
        where: {
          deletedAt: null,
          OR: [
            { displayName: { contains: term, mode: 'insensitive' } },
            { phone: { contains: term } },
            { email: { contains: term, mode: 'insensitive' } },
          ],
        },
        orderBy: { createdAt: 'desc' },
      }),
    );
    return rows.map(toView);
  }
}

function toView(c: {
  id: string;
  displayName: string;
  email: string | null;
  phone: string | null;
  fields: unknown;
  customFields: unknown;
  createdAt: Date;
}): ContactView {
  return {
    id: c.id,
    displayName: c.displayName,
    email: c.email,
    phone: c.phone,
    fields: (c.fields as Record<string, unknown>) ?? {},
    customFields: (c.customFields as Record<string, unknown>) ?? {},
    createdAt: c.createdAt,
  };
}
