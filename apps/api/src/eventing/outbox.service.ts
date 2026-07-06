import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantClient } from '../tenancy/tenant.service';

export interface EnqueueInput {
  tenantId: string;
  type: string;
  payload?: Record<string, unknown>;
}

export interface OutboxRow {
  id: string;
  tenantId: string;
  type: string;
  payload: unknown;
  attempts: number;
}

const MAX_ATTEMPTS = 5;
const BASE_BACKOFF_MS = 1_000;

/**
 * The transactional outbox (card #9.15). Producers `enqueue` INSIDE their own tenant transaction, so the
 * event and the state change commit atomically — a crash between commit and publish can't lose the event
 * (it's already durably in the outbox). The relay-side reads/marks use the admin connection because it
 * scans across tenants; the actual consumer work runs back inside each event's tenant context.
 */
@Injectable()
export class OutboxService {
  constructor(private readonly prisma: PrismaService) {}

  /** Enqueue within the caller's tenant transaction (same txn as the state change). Returns the event id. */
  async enqueue(tx: TenantClient, input: EnqueueInput): Promise<string> {
    const row = await tx.outboxEvent.create({
      data: {
        tenantId: input.tenantId,
        type: input.type,
        payload: (input.payload ?? {}) as Prisma.InputJsonValue,
      },
    });
    return row.id;
  }

  /** Relay: due pending events across all tenants (admin/bypass). */
  async fetchDue(limit: number, now: Date): Promise<OutboxRow[]> {
    const rows = await this.prisma.outboxEvent.findMany({
      where: { status: 'pending', nextAttemptAt: { lte: now } },
      orderBy: { createdAt: 'asc' },
      take: limit,
      select: { id: true, tenantId: true, type: true, payload: true, attempts: true },
    });
    return rows as OutboxRow[];
  }

  async markPublished(id: string, now: Date): Promise<void> {
    await this.prisma.outboxEvent.update({
      where: { id },
      data: { status: 'published', publishedAt: now },
    });
  }

  /** Increment attempts; schedule a backed-off retry, or move to the dead-letter state after the cap. */
  async markFailure(
    id: string,
    attempts: number,
    error: string,
    now: Date,
  ): Promise<'retry' | 'dead'> {
    const nextAttempts = attempts + 1;
    if (nextAttempts >= MAX_ATTEMPTS) {
      await this.prisma.outboxEvent.update({
        where: { id },
        data: { status: 'dead', attempts: nextAttempts, lastError: error.slice(0, 2000) },
      });
      return 'dead';
    }
    const delay = BASE_BACKOFF_MS * 2 ** attempts; // exponential backoff
    await this.prisma.outboxEvent.update({
      where: { id },
      data: {
        attempts: nextAttempts,
        lastError: error.slice(0, 2000),
        nextAttemptAt: new Date(now.getTime() + delay),
      },
    });
    return 'retry';
  }
}
