import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantService } from '../tenancy/tenant.service';

export type CustomFieldTarget = 'customer' | 'vehicle';
export type CustomFieldType = 'text' | 'number' | 'date' | 'select' | 'boolean';

export interface CustomFieldView {
  id: string;
  appliesTo: CustomFieldTarget;
  key: string;
  label: string;
  type: CustomFieldType;
  required: boolean;
  options: string[];
  archived: boolean;
}

export interface DefineCustomFieldInput {
  appliesTo: CustomFieldTarget;
  key: string;
  label: string;
  type: CustomFieldType;
  required?: boolean;
  options?: string[];
}

const KEY_RE = /^[a-z][a-z0-9_]{0,49}$/;

/**
 * Per-tenant custom field definitions (card #11) for customers and vehicles, plus validation of the
 * values written into a record's `customFields` bag. One schema serves every industry. Archiving a
 * field hides it (and stops validating it) without touching existing stored values.
 */
@Injectable()
export class CustomFieldService {
  constructor(private readonly tenants: TenantService) {}

  async define(tenantId: string, input: DefineCustomFieldInput): Promise<CustomFieldView> {
    if (!KEY_RE.test(input.key))
      throw new BadRequestException('key must be snake_case starting with a letter (≤50 chars)');
    if (!input.label?.trim()) throw new BadRequestException('label is required');
    if (input.type === 'select' && (!input.options || input.options.length === 0))
      throw new BadRequestException('a select field needs at least one option');

    return this.tenants.runInTenant(tenantId, async (tx) => {
      const existing = await tx.customField.findFirst({
        where: { appliesTo: input.appliesTo, key: input.key },
      });
      if (existing)
        throw new BadRequestException(`A ${input.appliesTo} field "${input.key}" already exists`);
      const row = await tx.customField.create({
        data: {
          tenantId,
          appliesTo: input.appliesTo,
          key: input.key,
          label: input.label.trim(),
          type: input.type,
          required: input.required ?? false,
          options: (input.options ?? []) as Prisma.InputJsonValue,
        },
      });
      return toView(row);
    });
  }

  async list(tenantId: string, appliesTo?: CustomFieldTarget): Promise<CustomFieldView[]> {
    return this.tenants.runInTenant(tenantId, async (tx) => {
      const rows = await tx.customField.findMany({
        where: { ...(appliesTo ? { appliesTo } : {}) },
        orderBy: { createdAt: 'asc' },
      });
      return rows.map(toView);
    });
  }

  async update(
    tenantId: string,
    id: string,
    patch: { label?: string; required?: boolean; options?: string[] },
  ): Promise<CustomFieldView> {
    return this.tenants.runInTenant(tenantId, async (tx) => {
      const row = await tx.customField.findFirst({ where: { id } });
      if (!row) throw new NotFoundException('Custom field not found');
      const data: Prisma.CustomFieldUpdateManyMutationInput = {};
      if (patch.label !== undefined) data.label = patch.label.trim();
      if (patch.required !== undefined) data.required = patch.required;
      if (patch.options !== undefined) data.options = patch.options as Prisma.InputJsonValue;
      await tx.customField.updateMany({ where: { id }, data });
      const updated = await tx.customField.findFirst({ where: { id } });
      return toView(updated!);
    });
  }

  /** Soft delete — hides the field (and stops validating it) but keeps values already stored on records. */
  async archive(tenantId: string, id: string): Promise<void> {
    await this.tenants.runInTenant(tenantId, async (tx) => {
      const res = await tx.customField.updateMany({ where: { id }, data: { archived: true } });
      if (res.count !== 1) throw new NotFoundException('Custom field not found');
    });
  }

  /**
   * Validate + normalise the custom values a caller wants to store on a record. Required active fields
   * must be present; every value must match its field's type; unknown keys are rejected. Archived fields
   * are ignored (their values, if already stored, are preserved by callers merging over the old bag).
   */
  async validateValues(
    tenantId: string,
    appliesTo: CustomFieldTarget,
    values: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const defs = await this.tenants.runInTenant(tenantId, (tx) =>
      tx.customField.findMany({ where: { appliesTo, archived: false } }),
    );
    const byKey = new Map(defs.map((d) => [d.key, d]));

    for (const key of Object.keys(values)) {
      if (!byKey.has(key)) throw new BadRequestException(`Unknown custom field "${key}"`);
    }

    const out: Record<string, unknown> = {};
    for (const def of defs) {
      const raw = values[def.key];
      const missing = raw === undefined || raw === null || raw === '';
      if (missing) {
        if (def.required) throw new BadRequestException(`"${def.label}" is required`);
        continue;
      }
      out[def.key] = coerce(def, raw);
    }
    return out;
  }
}

function coerce(
  def: { key: string; label: string; type: string; options: unknown },
  raw: unknown,
): unknown {
  switch (def.type) {
    case 'text':
      if (typeof raw !== 'string') throw new BadRequestException(`"${def.label}" must be text`);
      return raw;
    case 'number': {
      const n = typeof raw === 'number' ? raw : Number(raw);
      if (!Number.isFinite(n)) throw new BadRequestException(`"${def.label}" must be a number`);
      return n;
    }
    case 'boolean':
      if (typeof raw !== 'boolean')
        throw new BadRequestException(`"${def.label}" must be true/false`);
      return raw;
    case 'date': {
      if (typeof raw !== 'string' || Number.isNaN(new Date(raw).getTime()))
        throw new BadRequestException(`"${def.label}" must be a date`);
      return raw;
    }
    case 'select': {
      const options = (def.options as string[]) ?? [];
      if (typeof raw !== 'string' || !options.includes(raw))
        throw new BadRequestException(`"${def.label}" must be one of: ${options.join(', ')}`);
      return raw;
    }
    default:
      throw new BadRequestException(`Unknown field type "${def.type}"`);
  }
}

function toView(f: {
  id: string;
  appliesTo: string;
  key: string;
  label: string;
  type: string;
  required: boolean;
  options: unknown;
  archived: boolean;
}): CustomFieldView {
  return {
    id: f.id,
    appliesTo: f.appliesTo as CustomFieldTarget,
    key: f.key,
    label: f.label,
    type: f.type as CustomFieldType,
    required: f.required,
    options: (f.options as string[]) ?? [],
    archived: f.archived,
  };
}
