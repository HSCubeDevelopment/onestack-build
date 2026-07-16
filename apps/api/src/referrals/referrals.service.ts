import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { TenantService } from '../tenancy/tenant.service';

export interface ReferralCodeView {
  contactId: string;
  code: string;
}

export interface ReferralView {
  id: string;
  referrerContactId: string;
  referredName: string;
  referredPhone: string | null;
  referredContactId: string | null;
  status: 'pending' | 'converted' | 'rewarded';
  rewardNote: string | null;
  createdAt: string;
}

/**
 * Referral engine (Phase 4, card #231). GENERIC core (Comms & Marketing). Each customer gets a stable
 * referral code; referrals they bring in are tracked from pending → converted → rewarded, so incentives
 * are trackable. Tenant-scoped throughout.
 */
@Injectable()
export class ReferralsService {
  constructor(private readonly tenants: TenantService) {}

  /** Get or create the referrer's stable code. */
  async ensureCode(tenantId: string, contactId: string): Promise<ReferralCodeView> {
    return this.tenants.runInTenant(tenantId, async (tx) => {
      const existing = await tx.referralCode.findFirst({ where: { contactId } });
      if (existing) return { contactId, code: existing.code };
      const code = `REF-${randomUUID().slice(0, 6).toUpperCase()}`;
      const row = await tx.referralCode.create({ data: { tenantId, contactId, code } });
      return { contactId, code: row.code };
    });
  }

  /** Record a new referral brought in by a referrer. */
  async create(
    tenantId: string,
    input: { referrerContactId: string; referredName: string; referredPhone?: string },
  ): Promise<ReferralView> {
    const referredName = input.referredName?.trim();
    if (!referredName) throw new BadRequestException('referredName is required');
    return this.tenants.runInTenant(tenantId, async (tx) => {
      const row = await tx.referral.create({
        data: {
          tenantId,
          referrerContactId: input.referrerContactId,
          referredName,
          referredPhone: input.referredPhone?.trim() || null,
        },
      });
      return toView(row);
    });
  }

  async list(tenantId: string): Promise<ReferralView[]> {
    const rows = await this.tenants.runInTenant(tenantId, (tx) =>
      tx.referral.findMany({ orderBy: { createdAt: 'desc' } }),
    );
    return rows.map(toView);
  }

  async convert(tenantId: string, id: string, referredContactId?: string): Promise<ReferralView> {
    return this.setStatus(tenantId, id, 'converted', { referredContactId });
  }

  async reward(tenantId: string, id: string, note?: string): Promise<ReferralView> {
    return this.setStatus(tenantId, id, 'rewarded', { rewardNote: note });
  }

  private async setStatus(
    tenantId: string,
    id: string,
    status: 'converted' | 'rewarded',
    extra: { referredContactId?: string; rewardNote?: string },
  ): Promise<ReferralView> {
    return this.tenants.runInTenant(tenantId, async (tx) => {
      const ref = await tx.referral.findFirst({ where: { id } });
      if (!ref) throw new NotFoundException('Referral not found');
      if (status === 'rewarded' && ref.status === 'pending')
        throw new BadRequestException('Convert the referral before rewarding it');
      const row = await tx.referral.update({
        where: { id },
        data: {
          status,
          ...(extra.referredContactId ? { referredContactId: extra.referredContactId } : {}),
          ...(extra.rewardNote !== undefined
            ? { rewardNote: extra.rewardNote?.trim() || null }
            : {}),
        },
      });
      return toView(row);
    });
  }
}

function toView(r: {
  id: string;
  referrerContactId: string;
  referredName: string;
  referredPhone: string | null;
  referredContactId: string | null;
  status: string;
  rewardNote: string | null;
  createdAt: Date;
}): ReferralView {
  return {
    id: r.id,
    referrerContactId: r.referrerContactId,
    referredName: r.referredName,
    referredPhone: r.referredPhone,
    referredContactId: r.referredContactId,
    status: r.status as ReferralView['status'],
    rewardNote: r.rewardNote,
    createdAt: r.createdAt.toISOString(),
  };
}
