import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { PackRegistry } from '../core/pack-registry';
import { CustomFieldService, CustomFieldTarget } from '../custom-fields/custom-field.service';
import { TenantService } from '../tenancy/tenant.service';

export interface CreateSubjectInput {
  type: string;
  label: string;
  fields?: Record<string, unknown>;
  customFields?: Record<string, unknown>;
  contactId?: string;
}

export interface SubjectView {
  id: string;
  type: string;
  label: string;
  fields: Record<string, unknown>;
  customFields: Record<string, unknown>;
  contactId: string | null;
}

// Subject types that carry per-tenant custom fields (card #11). Currently only the automotive vehicle.
const CUSTOM_FIELD_TARGET: Record<string, CustomFieldTarget> = { vehicle: 'vehicle' };

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
    private readonly customFields: CustomFieldService,
  ) {}

  async create(tenantId: string, input: CreateSubjectInput): Promise<SubjectView> {
    if (!this.registry.hasSubjectType(input.type)) {
      throw new BadRequestException(`Unknown subject type: ${input.type}`);
    }
    const def = this.registry.getSubjectType(input.type);
    const fields = this.validate(def.fields, input.fields ?? {});
    const customFields = await this.resolveCustomFields(tenantId, input.type, input.customFields);

    const s = await this.tenants.runInTenant(tenantId, (tx) =>
      tx.subject.create({
        data: {
          tenantId,
          type: input.type,
          label: input.label,
          fields: fields as Prisma.InputJsonValue,
          customFields: customFields as Prisma.InputJsonValue,
          contactId: input.contactId ?? null,
        },
      }),
    );
    return toView(s);
  }

  /** Set/replace a subject's custom field values (card #11). Validated against the tenant's defs. */
  async setCustomFields(
    tenantId: string,
    id: string,
    values: Record<string, unknown>,
  ): Promise<SubjectView> {
    const current = await this.tenants.runInTenant(tenantId, (tx) =>
      tx.subject.findFirst({ where: { id, deletedAt: null } }),
    );
    if (!current) throw new NotFoundException('Subject not found');
    const validated = await this.resolveCustomFields(tenantId, current.type, values);
    const merged = { ...(current.customFields as Record<string, unknown>), ...validated };
    await this.tenants.runInTenant(tenantId, (tx) =>
      tx.subject.updateMany({
        where: { id, deletedAt: null },
        data: { customFields: merged as Prisma.InputJsonValue },
      }),
    );
    return this.get(tenantId, id);
  }

  private async resolveCustomFields(
    tenantId: string,
    type: string,
    values?: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const target = CUSTOM_FIELD_TARGET[type];
    if (!target) {
      if (values && Object.keys(values).length > 0)
        throw new BadRequestException(`Subject type "${type}" does not support custom fields`);
      return {};
    }
    return this.customFields.validateValues(tenantId, target, values ?? {});
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
          SubjectRow[]
        >`SELECT "id", "type", "label", "fields", "customFields", "contactId"
        FROM "onestack_subject"
        WHERE "type" = ${type}
          AND "fields" ->> ${fieldKey} ILIKE ${`%${valueContains}%`}
          AND "deletedAt" IS NULL
        ORDER BY "createdAt" DESC`,
    );
    return rows.map(toView);
  }

  /**
   * Search subjects of a type across SEVERAL JSONB field keys with one term (card #11) — e.g. vehicles
   * by rego / VIN / make / model. Case-insensitive substring match. This tenant only.
   */
  async searchAcrossFields(
    tenantId: string,
    type: string,
    fieldKeys: string[],
    q: string,
  ): Promise<SubjectView[]> {
    const term = q.trim();
    if (!term || fieldKeys.length === 0) return [];
    const like = `%${term}%`;
    // Build an OR over the requested keys. Keys are a fixed allow-list from the caller (not user input).
    const orSql = Prisma.join(
      fieldKeys.map((k) => Prisma.sql`"fields" ->> ${k} ILIKE ${like}`),
      ' OR ',
    );
    const rows = await this.tenants.runInTenant(
      tenantId,
      (tx) =>
        tx.$queryRaw<
          SubjectRow[]
        >`SELECT "id", "type", "label", "fields", "customFields", "contactId"
        FROM "onestack_subject"
        WHERE "type" = ${type} AND "deletedAt" IS NULL AND (${orSql})
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

interface SubjectRow {
  id: string;
  type: string;
  label: string;
  fields: unknown;
  customFields: unknown;
  contactId: string | null;
}

function toView(s: SubjectRow): SubjectView {
  return {
    id: s.id,
    type: s.type,
    label: s.label,
    fields: (s.fields as Record<string, unknown>) ?? {},
    customFields: (s.customFields as Record<string, unknown>) ?? {},
    contactId: s.contactId,
  };
}
