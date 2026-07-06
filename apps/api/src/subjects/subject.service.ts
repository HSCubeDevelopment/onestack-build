import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { PackRegistry } from '../core/pack-registry';
import { TenantService } from '../tenancy/tenant.service';

export interface CreateSubjectInput {
  type: string;
  label: string;
  fields?: Record<string, unknown>;
  contactId?: string;
}

export interface SubjectView {
  id: string;
  type: string;
  label: string;
  fields: Record<string, unknown>;
  contactId: string | null;
}

/**
 * Pack-typed Subject (card #6.4) — "the thing the work is about". A pack declares a Subject type + its
 * field schema via config (no core migration); Work Items and Contacts link to Subjects. The core never
 * knows what "vehicle" or "property" is — it only knows a Subject has a pack-validated `fields` blob.
 */
@Injectable()
export class SubjectService {
  constructor(
    private readonly tenants: TenantService,
    private readonly registry: PackRegistry,
  ) {}

  async create(tenantId: string, input: CreateSubjectInput): Promise<SubjectView> {
    if (!this.registry.hasSubjectType(input.type)) {
      throw new BadRequestException(`Unknown subject type: ${input.type}`);
    }
    const def = this.registry.getSubjectType(input.type);
    const fields = this.validate(def.fields, input.fields ?? {});

    const s = await this.tenants.runInTenant(tenantId, (tx) =>
      tx.subject.create({
        data: {
          tenantId,
          type: input.type,
          label: input.label,
          fields: fields as Prisma.InputJsonValue,
          contactId: input.contactId ?? null,
        },
      }),
    );
    return toView(s);
  }

  async get(tenantId: string, id: string): Promise<SubjectView> {
    const s = await this.tenants.runInTenant(tenantId, (tx) =>
      tx.subject.findFirst({ where: { id, deletedAt: null } }),
    );
    if (!s) throw new NotFoundException('Subject not found');
    return toView(s);
  }

  async listForContact(tenantId: string, contactId: string): Promise<SubjectView[]> {
    const rows = await this.tenants.runInTenant(tenantId, (tx) =>
      tx.subject.findMany({ where: { contactId, deletedAt: null } }),
    );
    return rows.map(toView);
  }

  /** The subjects linked to a Work Item (e.g. a job's vehicle(s)). */
  async listForWorkItem(tenantId: string, workItemId: string): Promise<SubjectView[]> {
    const rows = await this.tenants.runInTenant(tenantId, (tx) =>
      tx.subject.findMany({
        where: { deletedAt: null, workItems: { some: { workItemId } } },
      }),
    );
    return rows.map(toView);
  }

  /** Search subjects of a type by a JSONB field value (e.g. vehicles by rego). This tenant only. */
  async searchByField(
    tenantId: string,
    type: string,
    fieldKey: string,
    valueContains: string,
  ): Promise<SubjectView[]> {
    const rows = await this.tenants.runInTenant(
      tenantId,
      (tx) =>
        tx.$queryRaw<
          { id: string; type: string; label: string; fields: unknown; contactId: string | null }[]
        >`SELECT "id", "type", "label", "fields", "contactId"
        FROM "onestack_subject"
        WHERE "type" = ${type}
          AND "fields" ->> ${fieldKey} ILIKE ${`%${valueContains}%`}
          AND "deletedAt" IS NULL
        ORDER BY "createdAt" DESC`,
    );
    return rows.map(toView);
  }

  /** Referenced by a Work Item → soft-delete + the caller should warn (per card #6.4 edge case). */
  async softDelete(tenantId: string, id: string): Promise<{ referencedByWorkItems: number }> {
    return this.tenants.runInTenant(tenantId, async (tx) => {
      const refs = await tx.workItemSubject.count({ where: { subjectId: id } });
      await tx.subject.updateMany({
        where: { id, deletedAt: null },
        data: { deletedAt: new Date() },
      });
      return { referencedByWorkItems: refs };
    });
  }

  private validate(schema: z.ZodTypeAny, fields: unknown): Record<string, unknown> {
    const parsed = schema.safeParse(fields);
    if (!parsed.success) throw new BadRequestException(`Invalid fields: ${parsed.error.message}`);
    return parsed.data as Record<string, unknown>;
  }
}

function toView(s: {
  id: string;
  type: string;
  label: string;
  fields: unknown;
  contactId: string | null;
}): SubjectView {
  return {
    id: s.id,
    type: s.type,
    label: s.label,
    fields: (s.fields as Record<string, unknown>) ?? {},
    contactId: s.contactId,
  };
}
