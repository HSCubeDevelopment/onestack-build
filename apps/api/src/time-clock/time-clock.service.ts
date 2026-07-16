import { BadRequestException, Injectable } from '@nestjs/common';
import type { AppRole } from '../auth/auth.types';
import { TenantService } from '../tenancy/tenant.service';

export interface TimeEntryView {
  id: string;
  userId: string;
  clockInAt: string;
  clockOutAt: string | null;
  /** Whole minutes for a closed session; null while still on the clock. */
  minutes: number | null;
}

export interface ClockStatus {
  onClock: boolean;
  /** The open session, or null when clocked out. */
  entry: TimeEntryView | null;
}

export interface StaffTotal {
  userId: string;
  role: AppRole | null;
  /** Sum of minutes over closed sessions in the window. */
  totalMinutes: number;
  sessions: number;
  onClock: boolean;
  lastClockInAt: string | null;
}

interface EntryRow {
  id: string;
  userId: string;
  clockInAt: Date;
  clockOutAt: Date | null;
}

function toView(r: EntryRow): TimeEntryView {
  return {
    id: r.id,
    userId: r.userId,
    clockInAt: r.clockInAt.toISOString(),
    clockOutAt: r.clockOutAt ? r.clockOutAt.toISOString() : null,
    minutes: r.clockOutAt ? minutesBetween(r.clockInAt, r.clockOutAt) : null,
  };
}

function minutesBetween(a: Date, b: Date): number {
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / 60000));
}

/**
 * Staff time clock — check-in / check-out attendance. GENERIC core (Scheduling & Ops). A user has at most
 * one open session at a time (enforced by a partial unique index + the check here). OWNER reads a summary
 * of hours across all staff; STAFF read only their own sessions. Tenant-scoped via TenantService.
 */
@Injectable()
export class TimeClockService {
  constructor(private readonly tenants: TenantService) {}

  /** Start a session. Errors if the user is already on the clock. */
  async checkIn(tenantId: string, userId: string): Promise<ClockStatus> {
    return this.tenants.runInTenant(tenantId, async (tx) => {
      const open = await tx.timeEntry.findFirst({ where: { userId, clockOutAt: null } });
      if (open) throw new BadRequestException('Already checked in');
      const row = await tx.timeEntry.create({ data: { tenantId, userId } });
      return { onClock: true, entry: toView(row) };
    });
  }

  /** End the open session. Errors if the user is not on the clock. */
  async checkOut(tenantId: string, userId: string): Promise<ClockStatus> {
    return this.tenants.runInTenant(tenantId, async (tx) => {
      const open = await tx.timeEntry.findFirst({ where: { userId, clockOutAt: null } });
      if (!open) throw new BadRequestException('Not checked in');
      const row = await tx.timeEntry.update({
        where: { id: open.id },
        data: { clockOutAt: new Date() },
      });
      return { onClock: false, entry: toView(row) };
    });
  }

  /** The caller's current on/off-clock state. */
  async status(tenantId: string, userId: string): Promise<ClockStatus> {
    return this.tenants.runInTenant(tenantId, async (tx) => {
      const open = await tx.timeEntry.findFirst({ where: { userId, clockOutAt: null } });
      return { onClock: !!open, entry: open ? toView(open) : null };
    });
  }

  /** The caller's own sessions, newest first. */
  async myEntries(tenantId: string, userId: string): Promise<TimeEntryView[]> {
    return this.tenants.runInTenant(tenantId, async (tx) => {
      const rows = await tx.timeEntry.findMany({
        where: { userId },
        orderBy: { clockInAt: 'desc' },
        take: 100,
      });
      return rows.map(toView);
    });
  }

  /**
   * OWNER view: hours logged per staff member across an optional [from, to] window (by clockInAt).
   * Role comes from Membership (same tenant, RLS-scoped). Names/emails are resolved by the auth directory.
   */
  async summary(tenantId: string, fromIso?: string, toIso?: string): Promise<StaffTotal[]> {
    const clockInAt: Record<string, Date> = {};
    if (fromIso) clockInAt.gte = new Date(fromIso);
    if (toIso) clockInAt.lte = new Date(toIso);
    const where = Object.keys(clockInAt).length ? { clockInAt } : {};

    return this.tenants.runInTenant(tenantId, async (tx) => {
      const [rows, memberships] = await Promise.all([
        tx.timeEntry.findMany({ where, orderBy: { clockInAt: 'desc' } }),
        tx.membership.findMany({ select: { userId: true, role: true } }),
      ]);
      const roleByUser = new Map<string, AppRole>(
        memberships.map((m) => [m.userId, m.role as AppRole]),
      );

      const byUser = new Map<string, StaffTotal>();
      for (const r of rows) {
        const t = byUser.get(r.userId) ?? {
          userId: r.userId,
          role: roleByUser.get(r.userId) ?? null,
          totalMinutes: 0,
          sessions: 0,
          onClock: false,
          lastClockInAt: null,
        };
        t.sessions += 1;
        if (r.clockOutAt) t.totalMinutes += minutesBetween(r.clockInAt, r.clockOutAt);
        else t.onClock = true;
        const iso = r.clockInAt.toISOString();
        if (!t.lastClockInAt || iso > t.lastClockInAt) t.lastClockInAt = iso;
        byUser.set(r.userId, t);
      }

      // Include staff who have a membership but no sessions yet, so the admin sees everyone.
      for (const m of memberships) {
        if (!byUser.has(m.userId)) {
          byUser.set(m.userId, {
            userId: m.userId,
            role: m.role as AppRole,
            totalMinutes: 0,
            sessions: 0,
            onClock: false,
            lastClockInAt: null,
          });
        }
      }

      return [...byUser.values()].sort((a, b) => b.totalMinutes - a.totalMinutes);
    });
  }
}
