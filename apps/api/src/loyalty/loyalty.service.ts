import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { TenantService } from '../tenancy/tenant.service';

export interface LoyaltyTxnView {
  id: string;
  delta: number;
  reason: string;
  note: string | null;
  createdAt: string;
}
export interface LoyaltyAccountView {
  contactId: string;
  points: number;
  transactions: LoyaltyTxnView[];
}

export interface GiftCardView {
  id: string;
  code: string;
  initialCents: number;
  balanceCents: number;
  status: 'active' | 'void';
  note: string | null;
  createdAt: string;
}

/**
 * Loyalty, rewards & gift cards (Phase 4, card #230). GENERIC core (Comms & Marketing). Two LEDGERS to
 * drive repeat visits: a points balance per customer, and gift cards with a stored balance. There is NO
 * card payment processing here — redeeming just decrements a balance (integrating gift cards into invoice
 * settlement belongs to the deferred payments phase). Tenant-scoped throughout.
 */
@Injectable()
export class LoyaltyService {
  constructor(private readonly tenants: TenantService) {}

  // ---- Loyalty points ----

  async adjustPoints(
    tenantId: string,
    contactId: string,
    delta: number,
    reason?: string,
    note?: string,
  ): Promise<LoyaltyAccountView> {
    if (!Number.isInteger(delta) || delta === 0)
      throw new BadRequestException('delta must be a non-zero integer');
    return this.tenants.runInTenant(tenantId, async (tx) => {
      const existing = await tx.loyaltyAccount.findFirst({ where: { contactId } });
      const points = (existing?.points ?? 0) + delta;
      if (points < 0) throw new BadRequestException('Not enough points to redeem');
      if (existing) await tx.loyaltyAccount.update({ where: { id: existing.id }, data: { points, updatedAt: new Date() } });
      else await tx.loyaltyAccount.create({ data: { tenantId, contactId, points } });
      await tx.loyaltyTxn.create({ data: { tenantId, contactId, delta, reason: reason?.trim() || 'adjust', note: note?.trim() || null } });
      const txns = await tx.loyaltyTxn.findMany({ where: { contactId }, orderBy: { createdAt: 'desc' }, take: 20 });
      return { contactId, points, transactions: txns.map(txnView) };
    });
  }

  async getAccount(tenantId: string, contactId: string): Promise<LoyaltyAccountView> {
    return this.tenants.runInTenant(tenantId, async (tx) => {
      const acc = await tx.loyaltyAccount.findFirst({ where: { contactId } });
      const txns = await tx.loyaltyTxn.findMany({ where: { contactId }, orderBy: { createdAt: 'desc' }, take: 20 });
      return { contactId, points: acc?.points ?? 0, transactions: txns.map(txnView) };
    });
  }

  // ---- Gift cards ----

  async issueGiftCard(tenantId: string, input: { initialCents: number; code?: string; note?: string }): Promise<GiftCardView> {
    if (!Number.isInteger(input.initialCents) || input.initialCents < 1)
      throw new BadRequestException('initialCents must be a positive integer');
    const code = (input.code?.trim() || `GC-${randomUUID().slice(0, 8).toUpperCase()}`);
    return this.tenants.runInTenant(tenantId, async (tx) => {
      const existing = await tx.giftCard.findFirst({ where: { code } });
      if (existing) throw new BadRequestException('A gift card with this code already exists');
      const row = await tx.giftCard.create({
        data: { tenantId, code, initialCents: input.initialCents, balanceCents: input.initialCents, note: input.note?.trim() || null },
      });
      return cardView(row);
    });
  }

  async listGiftCards(tenantId: string): Promise<GiftCardView[]> {
    const rows = await this.tenants.runInTenant(tenantId, (tx) =>
      tx.giftCard.findMany({ orderBy: { createdAt: 'desc' } }),
    );
    return rows.map(cardView);
  }

  async redeemGiftCard(tenantId: string, id: string, amountCents: number, note?: string): Promise<GiftCardView> {
    if (!Number.isInteger(amountCents) || amountCents < 1)
      throw new BadRequestException('amountCents must be a positive integer');
    return this.tenants.runInTenant(tenantId, async (tx) => {
      const card = await tx.giftCard.findFirst({ where: { id } });
      if (!card) throw new NotFoundException('Gift card not found');
      if (card.status !== 'active') throw new BadRequestException('This gift card is not active');
      if (amountCents > card.balanceCents) throw new BadRequestException('Amount exceeds the remaining balance');
      await tx.giftCardTxn.create({ data: { tenantId, giftCardId: id, amountCents: -amountCents, note: note?.trim() || null } });
      const row = await tx.giftCard.update({ where: { id }, data: { balanceCents: card.balanceCents - amountCents } });
      return cardView(row);
    });
  }

  async voidGiftCard(tenantId: string, id: string): Promise<GiftCardView> {
    return this.tenants.runInTenant(tenantId, async (tx) => {
      const card = await tx.giftCard.findFirst({ where: { id } });
      if (!card) throw new NotFoundException('Gift card not found');
      const row = await tx.giftCard.update({ where: { id }, data: { status: 'void' } });
      return cardView(row);
    });
  }
}

function txnView(t: { id: string; delta: number; reason: string; note: string | null; createdAt: Date }): LoyaltyTxnView {
  return { id: t.id, delta: t.delta, reason: t.reason, note: t.note, createdAt: t.createdAt.toISOString() };
}
function cardView(c: {
  id: string; code: string; initialCents: number; balanceCents: number; status: string; note: string | null; createdAt: Date;
}): GiftCardView {
  return {
    id: c.id, code: c.code, initialCents: c.initialCents, balanceCents: c.balanceCents,
    status: c.status as 'active' | 'void', note: c.note, createdAt: c.createdAt.toISOString(),
  };
}
