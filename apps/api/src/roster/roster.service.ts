import { BadRequestException, Injectable } from '@nestjs/common';
import { TenantService } from '../tenancy/tenant.service';

export type ShiftKind = 'shift' | 'time_off';

export interface ShiftView {
  id: string;
  staffUserId: string | null;
  staffName: string;
  kind: ShiftKind;
  startsAt: string;
  endsAt: string;
  notes: string | null;
}

export interface AddShiftInput {
  staffName: string;
  staffUserId?: string;
  kind?: ShiftKind;
  startsAt: string;
  endsAt: string;
  notes?: string;
}

/**
 * Roster & staff management (Phase 4, card #211). GENERIC core (Scheduling & Ops). Staff shifts,
 * availability and time-off as scheduled blocks. Tenant-scoped. (Linking a shift to a platform user via
 * staffUserId is optional; staffName is the label — a lightweight MVP that avoids coupling to auth.)
 */
@Injectable()
export class RosterService {
  constructor(private readonly tenants: TenantService) {}

  async add(tenantId: string, input: AddShiftInput): Promise<ShiftView> {
    const staffName = input.staffName?.trim();
    if (!staffName) throw new BadRequestException('staffName is required');
    const start = new Date(input.startsAt);
    const end = new Date(input.endsAt);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()))
      throw new BadRequestException('startsAt and endsAt must be valid dates');
    if (end.getTime() <= start.getTime()) throw new BadRequestException('endsAt must be after startsAt');

    return this.tenants.runInTenant(tenantId, async (tx) => {
      const row = await tx.shift.create({
        data: {
          tenantId,
          staffName,
          staffUserId: input.staffUserId ?? null,
          kind: input.kind === 'time_off' ? 'time_off' : 'shift',
          startsAt: start,
          endsAt: end,
          notes: input.notes?.trim() || null,
        },
      });
      return toView(row);
    });
  }

  /** Shifts overlapping [from, to] (defaults handled by the controller), soonest first. */
  async list(tenantId: string, fromIso?: string, toIso?: string): Promise<ShiftView[]> {
    const where: Record<string, unknown> = {};
    if (fromIso) where.endsAt = { gte: new Date(fromIso) };
    if (toIso) where.startsAt = { lte: new Date(toIso) };
    return this.tenants.runInTenant(tenantId, async (tx) => {
      const rows = await tx.shift.findMany({ where, orderBy: { startsAt: 'asc' } });
      return rows.map(toView);
    });
  }

  async remove(tenantId: string, id: string): Promise<void> {
    await this.tenants.runInTenant(tenantId, (tx) => tx.shift.deleteMany({ where: { id } }));
  }
}

function toView(r: {
  id: string;
  staffUserId: string | null;
  staffName: string;
  kind: string;
  startsAt: Date;
  endsAt: Date;
  notes: string | null;
}): ShiftView {
  return {
    id: r.id,
    staffUserId: r.staffUserId,
    staffName: r.staffName,
    kind: r.kind as ShiftKind,
    startsAt: r.startsAt.toISOString(),
    endsAt: r.endsAt.toISOString(),
    notes: r.notes,
  };
}
