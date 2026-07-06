import { randomBytes } from 'node:crypto';
import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TenantService } from '../tenancy/tenant.service';

export interface LeadFormView {
  id: string;
  name: string;
  publicToken: string;
  enabled: boolean;
  embedUrl: string;
}

export interface ResolvedForm {
  tenantId: string;
  formId: string;
}

/**
 * A shop's public web form (card #12). The `publicToken` is an unguessable capability embedded in the
 * form snippet / hosted page. Shop-side CRUD is tenant-scoped via the wrapper; the PUBLIC submit path
 * resolves token → tenant through the BYPASSRLS admin connection (there is no tenant context yet), then
 * the lead itself is written under that tenant with RLS enforced.
 */
@Injectable()
export class LeadFormService {
  constructor(
    private readonly tenants: TenantService,
    private readonly prisma: PrismaService,
  ) {}

  async create(tenantId: string, name: string): Promise<LeadFormView> {
    if (!name?.trim()) throw new BadRequestException('name is required');
    const publicToken = randomBytes(24).toString('hex');
    return this.tenants.runInTenant(tenantId, async (tx) => {
      const form = await tx.leadForm.create({ data: { tenantId, name: name.trim(), publicToken } });
      return toFormView(form);
    });
  }

  async list(tenantId: string): Promise<LeadFormView[]> {
    return this.tenants.runInTenant(tenantId, async (tx) => {
      const rows = await tx.leadForm.findMany({ orderBy: { createdAt: 'desc' } });
      return rows.map(toFormView);
    });
  }

  async setEnabled(tenantId: string, id: string, enabled: boolean): Promise<LeadFormView> {
    return this.tenants.runInTenant(tenantId, async (tx) => {
      const rows = await tx.leadForm.updateMany({ where: { id }, data: { enabled } });
      if (rows.count !== 1) throw new BadRequestException('Form not found');
      const form = await tx.leadForm.findFirst({ where: { id } });
      return toFormView(form!);
    });
  }

  /**
   * Resolve a public token to its tenant + form. Uses the admin (BYPASSRLS) connection because the
   * caller is unauthenticated and there is no tenant context. Returns null if unknown or disabled.
   */
  async resolvePublic(token: string): Promise<ResolvedForm | null> {
    const form = await this.prisma.leadForm.findFirst({
      where: { publicToken: token, enabled: true },
      select: { id: true, tenantId: true },
    });
    return form ? { tenantId: form.tenantId, formId: form.id } : null;
  }
}

function toFormView(f: {
  id: string;
  name: string;
  publicToken: string;
  enabled: boolean;
}): LeadFormView {
  const base = process.env.PUBLIC_FORMS_BASE_URL ?? '';
  return {
    id: f.id,
    name: f.name,
    publicToken: f.publicToken,
    enabled: f.enabled,
    embedUrl: `${base}/enquire/${f.publicToken}`,
  };
}
