import { Injectable } from '@nestjs/common';
import { TenantService } from '../tenancy/tenant.service';
import type { CreateContactDto } from './dto/create-contact.dto';

export interface ContactView {
  id: string;
  displayName: string;
  email: string | null;
  phone: string | null;
  createdAt: Date;
}

/**
 * Contact is a CORE primitive (the party served) — industry-neutral, no vertical nouns.
 * Every method runs through TenantService.runInTenant, so RLS scopes it to the caller's tenant.
 * The service never sees another tenant's data even if the code had a bug — Postgres RLS is the floor.
 */
@Injectable()
export class ContactsService {
  constructor(private readonly tenants: TenantService) {}

  async create(tenantId: string, dto: CreateContactDto): Promise<ContactView> {
    return this.tenants.runInTenant(tenantId, async (tx) => {
      const c = await tx.contact.create({
        data: {
          tenantId, // must match the RLS context or WITH CHECK rejects the insert
          displayName: dto.displayName,
          email: dto.email ?? null,
          phone: dto.phone ?? null,
        },
      });
      return toView(c);
    });
  }

  async list(tenantId: string): Promise<ContactView[]> {
    return this.tenants.runInTenant(tenantId, async (tx) => {
      const rows = await tx.contact.findMany({
        where: { deletedAt: null },
        orderBy: { createdAt: 'desc' },
      });
      return rows.map(toView);
    });
  }
}

function toView(c: {
  id: string;
  displayName: string;
  email: string | null;
  phone: string | null;
  createdAt: Date;
}): ContactView {
  return {
    id: c.id,
    displayName: c.displayName,
    email: c.email,
    phone: c.phone,
    createdAt: c.createdAt,
  };
}
