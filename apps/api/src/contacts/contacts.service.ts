import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantService } from '../tenancy/tenant.service';

export interface ContactView {
  id: string;
  displayName: string;
  email: string | null;
  phone: string | null;
  fields: Record<string, unknown>;
  createdAt: Date;
}

export interface CreateContactInput {
  displayName: string;
  phone: string;
  email?: string;
  fields?: Record<string, unknown>;
}
export interface UpdateContactInput {
  displayName?: string;
  phone?: string;
  email?: string | null;
  fields?: Record<string, unknown>;
}

/**
 * Contact is a CORE primitive (the party served) — industry-neutral, no vertical nouns. In the automotive
 * pack it is relabelled "Customer" (terminology layer), and carries custom fields (insurer, excess) in
 * its JSONB `fields`. Every method runs through runInTenant → RLS scopes it to the caller's tenant.
 */
@Injectable()
export class ContactsService {
  constructor(private readonly tenants: TenantService) {}

  async create(tenantId: string, input: CreateContactInput): Promise<ContactView> {
    return this.tenants.runInTenant(tenantId, async (tx) => {
      const c = await tx.contact.create({
        data: {
          tenantId,
          displayName: input.displayName,
          phone: input.phone,
          email: input.email ?? null,
          fields: (input.fields ?? {}) as Prisma.InputJsonValue,
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
    return this.tenants.runInTenant(tenantId, async (tx) => {
      const data: Prisma.ContactUpdateManyMutationInput = {};
      if (patch.displayName !== undefined) data.displayName = patch.displayName;
      if (patch.phone !== undefined) data.phone = patch.phone;
      if (patch.email !== undefined) data.email = patch.email;
      if (patch.fields !== undefined) data.fields = patch.fields as Prisma.InputJsonValue;
      const res = await tx.contact.updateMany({ where: { id, deletedAt: null }, data });
      if (res.count !== 1) throw new NotFoundException('Contact not found');
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

  /** Search customers by name or phone (this tenant only). */
  async search(tenantId: string, q: string): Promise<ContactView[]> {
    const rows = await this.tenants.runInTenant(tenantId, (tx) =>
      tx.contact.findMany({
        where: {
          deletedAt: null,
          OR: [{ displayName: { contains: q, mode: 'insensitive' } }, { phone: { contains: q } }],
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
  createdAt: Date;
}): ContactView {
  return {
    id: c.id,
    displayName: c.displayName,
    email: c.email,
    phone: c.phone,
    fields: (c.fields as Record<string, unknown>) ?? {},
    createdAt: c.createdAt,
  };
}
