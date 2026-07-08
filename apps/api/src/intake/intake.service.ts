import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ContactsService } from '../contacts/contacts.service';
import { TenantService } from '../tenancy/tenant.service';
import { IntakeField, validateAnswers, validateFields } from './intake';

export interface IntakeFormView {
  id: string;
  name: string;
  active: boolean;
  fields: IntakeField[];
}

export interface IntakeSubmissionView {
  id: string;
  intakeFormId: string;
  formName: string;
  contactId: string;
  answers: Record<string, unknown>;
  submittedByUserId: string | null;
  submittedAt: Date;
}

/**
 * Digital intake & forms (Phase 3). A shop defines custom forms; staff fill one in against a customer and
 * the answers land on the customer record as a submission. Generic CRM. The form owns its field defs +
 * validation (independent of the custom-field system), so a form can collect any subset of questions.
 * Tenant-scoped via the central wrapper; a contact is validated through the ContactsService public API.
 */
@Injectable()
export class IntakeService {
  constructor(
    private readonly tenants: TenantService,
    private readonly contacts: ContactsService,
  ) {}

  async createForm(tenantId: string, name: string, fields: unknown): Promise<IntakeFormView> {
    const clean = name?.trim();
    if (!clean) throw new BadRequestException('name is required');
    const defs = validateFields(fields, (m) => new BadRequestException(m));
    return this.tenants.runInTenant(tenantId, async (tx) => {
      const row = await tx.intakeForm.create({
        data: { tenantId, name: clean, fields: defs as unknown as object },
      });
      return toFormView(row);
    });
  }

  async listForms(tenantId: string): Promise<IntakeFormView[]> {
    return this.tenants.runInTenant(tenantId, async (tx) => {
      const rows = await tx.intakeForm.findMany({ orderBy: { name: 'asc' } });
      return rows.map(toFormView);
    });
  }

  async getForm(tenantId: string, id: string): Promise<IntakeFormView> {
    const row = await this.tenants.runInTenant(tenantId, (tx) =>
      tx.intakeForm.findFirst({ where: { id } }),
    );
    if (!row) throw new NotFoundException('Intake form not found');
    return toFormView(row);
  }

  async updateForm(
    tenantId: string,
    id: string,
    patch: { name?: string; fields?: unknown; active?: boolean },
  ): Promise<IntakeFormView> {
    const name = patch.name !== undefined ? patch.name.trim() : undefined;
    if (name !== undefined && !name) throw new BadRequestException('name cannot be empty');
    const defs =
      patch.fields !== undefined
        ? validateFields(patch.fields, (m) => new BadRequestException(m))
        : undefined;
    return this.tenants.runInTenant(tenantId, async (tx) => {
      const row = await tx.intakeForm.findFirst({ where: { id } });
      if (!row) throw new NotFoundException('Intake form not found');
      const updated = await tx.intakeForm.update({
        where: { id },
        data: {
          ...(name !== undefined ? { name } : {}),
          ...(defs !== undefined ? { fields: defs as unknown as object } : {}),
          ...(patch.active !== undefined ? { active: patch.active } : {}),
        },
      });
      return toFormView(updated);
    });
  }

  /** Submit a completed form against a customer; the answers land on the customer record. */
  async submit(
    tenantId: string,
    contactId: string,
    formId: string,
    answers: Record<string, unknown>,
    submittedByUserId: string,
  ): Promise<IntakeSubmissionView> {
    await this.contacts.get(tenantId, contactId); // 404s for a missing/other-tenant contact
    const form = await this.getForm(tenantId, formId);
    if (!form.active) throw new BadRequestException('This form is no longer active');
    const clean = validateAnswers(form.fields, answers ?? {}, (m) => new BadRequestException(m));
    return this.tenants.runInTenant(tenantId, async (tx) => {
      const row = await tx.intakeSubmission.create({
        data: {
          tenantId,
          intakeFormId: formId,
          contactId,
          answers: clean as unknown as object,
          submittedByUserId,
        },
      });
      return { ...toSubmissionView(row), formName: form.name };
    });
  }

  /** A customer's completed intake forms — part of their record. */
  async submissionsForContact(
    tenantId: string,
    contactId: string,
  ): Promise<IntakeSubmissionView[]> {
    await this.contacts.get(tenantId, contactId);
    return this.tenants.runInTenant(tenantId, async (tx) => {
      const rows = await tx.intakeSubmission.findMany({
        where: { contactId },
        orderBy: { submittedAt: 'desc' },
        include: { intakeForm: true },
      });
      return rows.map((r) => ({ ...toSubmissionView(r), formName: r.intakeForm.name }));
    });
  }
}

function toFormView(row: {
  id: string;
  name: string;
  active: boolean;
  fields: unknown;
}): IntakeFormView {
  return {
    id: row.id,
    name: row.name,
    active: row.active,
    fields: (Array.isArray(row.fields) ? row.fields : []) as IntakeField[],
  };
}

function toSubmissionView(row: {
  id: string;
  intakeFormId: string;
  contactId: string;
  answers: unknown;
  submittedByUserId: string | null;
  submittedAt: Date;
}): IntakeSubmissionView {
  return {
    id: row.id,
    intakeFormId: row.intakeFormId,
    formName: '',
    contactId: row.contactId,
    answers: (row.answers ?? {}) as Record<string, unknown>,
    submittedByUserId: row.submittedByUserId,
    submittedAt: row.submittedAt,
  };
}
