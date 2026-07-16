import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { TenantClient, TenantService } from '../tenancy/tenant.service';
import {
  endOfToday,
  FleetBookingStatus,
  FleetMovementStatus,
  FleetVehicleStatus,
  normPhone,
  normRego,
  startOfToday,
} from './fleet.util';
import {
  CreateBookingDto,
  CreateMovementDto,
  CreateReturnDto,
  UpdateBookingDto,
  UpdateMovementDto,
  UpdateReturnDto,
  UpdateVehicleDto,
} from './dto/fleet.dto';

// ------------------------------------------------------------------ view types

export interface FleetVehicleView {
  id: string;
  rego: string;
  regoRaw: string;
  make: string;
  model: string;
  vehicleType: string;
  status: FleetVehicleStatus;
  isCompanyCar: boolean;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface FleetMovementView {
  id: string;
  contactId: string | null;
  driverName: string;
  driverPhone: string;
  ownerName: string;
  ownerPhone: string;
  carsInRego: string;
  carsInRegoRaw: string;
  carsOutVehicleId: string | null;
  carsOutRego: string;
  carsOutRegoRaw: string;
  purpose: string;
  movedAt: string | null;
  status: FleetMovementStatus;
  needsReview: boolean;
  reviewReason: string;
  notes: string;
  staffName: string;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FleetReturnView {
  id: string;
  movementId: string | null;
  contactId: string | null;
  returnedVehicleId: string | null;
  returnedRego: string;
  returnedRegoRaw: string;
  driverName: string;
  mobileNumber: string;
  returnedAt: string | null;
  bondStatus: string;
  notes: string;
  staffName: string;
  needsReview: boolean;
  reviewReason: string;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FleetBookingView {
  id: string;
  vehicleId: string | null;
  vehicleRego: string;
  contactId: string | null;
  bookingName: string;
  bookingMobile: string;
  startAt: string;
  expectedReturnAt: string | null;
  purpose: string;
  status: FleetBookingStatus;
  notes: string;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

/** One period a fleet car was out to a client — a movement plus its return (if any). */
export interface RentalPeriod {
  id: string;
  movementId: string | null;
  returnId: string | null;
  driverName: string;
  driverPhone: string;
  purpose: string;
  outAt: string | null;
  backAt: string | null;
  ongoing: boolean;
  notes: string;
  returnNotes: string;
}

export interface FleetDashboardStats {
  carsOut: number;
  returnedToday: number;
  goingOutToday: number;
  availableCars: number;
  bookedCars: number;
  overdue: number;
  needsAttention: number;
}

export interface RegoConflict {
  vehicle: FleetVehicleView | null;
  activeMovement: FleetMovementView | null;
  bookings: FleetBookingView[];
}

export interface FleetSearchResults {
  movements: FleetMovementView[];
  returns: FleetReturnView[];
  vehicles: FleetVehicleView[];
  bookings: FleetBookingView[];
}

export interface FleetActivity {
  id: string;
  actorUserId: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  createdAt: string;
}

const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null);

/**
 * Fleet & courtesy cars (migrated 1:1 from the "In N Out" staff app). Every read/write is tenant-scoped
 * through `runInTenant`; multi-step creates run in ONE transaction so the record + its derived vehicle
 * status + the audit row commit together (the legacy app did these as best-effort follow-ups). GENERIC
 * core (Scheduling & Ops) — nothing here touches another module's tables. Every business write is audited.
 */
@Injectable()
export class FleetService {
  constructor(
    private readonly tenants: TenantService,
    private readonly audit: AuditService,
  ) {}

  // ============================================================ vehicles

  async listVehicles(tenantId: string): Promise<FleetVehicleView[]> {
    return this.tenants.runInTenant(tenantId, async (tx) => {
      const rows = await tx.fleetVehicle.findMany({ orderBy: { rego: 'asc' } });
      return rows.map(toVehicleView);
    });
  }

  async getVehicleByRego(tenantId: string, rego: string): Promise<FleetVehicleView | null> {
    const clean = normRego(rego);
    return this.tenants.runInTenant(tenantId, async (tx) => {
      const row = await tx.fleetVehicle.findUnique({
        where: { tenantId_rego: { tenantId, rego: clean } },
      });
      return row ? toVehicleView(row) : null;
    });
  }

  async updateVehicle(
    tenantId: string,
    id: string,
    patch: UpdateVehicleDto,
    userId: string,
  ): Promise<FleetVehicleView> {
    return this.tenants.runInTenant(tenantId, async (tx) => {
      const existing = await tx.fleetVehicle.findFirst({ where: { id } });
      if (!existing) throw new NotFoundException('Vehicle not found');
      const row = await tx.fleetVehicle.update({
        where: { id },
        data: { ...patch, updatedAt: new Date() },
      });
      await this.audit.recordIn(tx, {
        tenantId,
        actorUserId: userId,
        action: 'fleet.vehicle.updated',
        entityType: 'fleet_vehicle',
        entityId: id,
      });
      return toVehicleView(row);
    });
  }

  /** Find-or-create a fleet vehicle by rego, within an existing tenant transaction. */
  private async ensureVehicleTx(
    tx: TenantClient,
    tenantId: string,
    rego: string,
    fields: { isCompanyCar?: boolean; regoRaw?: string } = {},
  ): Promise<{ id: string }> {
    const clean = normRego(rego);
    return tx.fleetVehicle.upsert({
      where: { tenantId_rego: { tenantId, rego: clean } },
      create: {
        tenantId,
        rego: clean,
        regoRaw: fields.regoRaw ?? rego,
        status: 'unknown',
        isCompanyCar: fields.isCompanyCar ?? false,
      },
      update: {},
      select: { id: true },
    });
  }

  /** Set a vehicle's status by rego (no-op if the car isn't in the fleet yet). */
  private async setVehicleStatusByRegoTx(
    tx: TenantClient,
    rego: string,
    status: FleetVehicleStatus,
  ): Promise<void> {
    await tx.fleetVehicle.updateMany({
      where: { rego: normRego(rego) },
      data: { status, updatedAt: new Date() },
    });
  }

  /** Free a returned car, but never override an explicit 'repair' hold. */
  private async freeVehicleAfterReturnTx(tx: TenantClient, rego: string): Promise<void> {
    await tx.fleetVehicle.updateMany({
      where: { rego: normRego(rego), status: { not: 'repair' } },
      data: { status: 'available', updatedAt: new Date() },
    });
  }

  // ============================================================ movements

  async createMovement(
    tenantId: string,
    userId: string,
    input: CreateMovementDto,
  ): Promise<FleetMovementView> {
    const carsIn = normRego(input.carsInRego ?? '');
    const carsOut = normRego(input.carsOutRego ?? '');
    return this.tenants.runInTenant(tenantId, async (tx) => {
      let carsOutVehicleId: string | null = null;
      if (carsIn) await this.ensureVehicleTx(tx, tenantId, carsIn, { regoRaw: input.carsInRego });
      if (carsOut) {
        const v = await this.ensureVehicleTx(tx, tenantId, carsOut, {
          isCompanyCar: true,
          regoRaw: input.carsOutRego,
        });
        carsOutVehicleId = v.id;
      }
      const row = await tx.fleetMovement.create({
        data: {
          tenantId,
          contactId: input.contactId ?? null,
          driverName: (input.driverName ?? '').trim(),
          driverPhone: normPhone(input.driverPhone ?? ''),
          ownerName: (input.ownerName ?? '').trim(),
          ownerPhone: normPhone(input.ownerPhone ?? ''),
          carsInRego: carsIn,
          carsInRegoRaw: input.carsInRego ?? '',
          carsOutVehicleId,
          carsOutRego: carsOut,
          carsOutRegoRaw: input.carsOutRego ?? '',
          purpose: input.purpose ?? '',
          movedAt: input.movedAt ? new Date(input.movedAt) : new Date(),
          status: 'active',
          staffName: (input.staffName ?? '').trim(),
          notes: input.notes ?? '',
          createdByUserId: userId,
          updatedByUserId: userId,
        },
      });
      // The fleet car is now out. Same transaction, so record + status + audit commit together.
      if (carsOut) await this.setVehicleStatusByRegoTx(tx, carsOut, 'out');
      await this.audit.recordIn(tx, {
        tenantId,
        actorUserId: userId,
        action: 'fleet.movement.created',
        entityType: 'fleet_movement',
        entityId: row.id,
      });
      return toMovementView(row);
    });
  }

  async getMovement(tenantId: string, id: string): Promise<FleetMovementView> {
    return this.tenants.runInTenant(tenantId, async (tx) => {
      const row = await tx.fleetMovement.findFirst({ where: { id } });
      if (!row) throw new NotFoundException('Movement not found');
      return toMovementView(row);
    });
  }

  async updateMovement(
    tenantId: string,
    id: string,
    patch: UpdateMovementDto,
    userId: string,
  ): Promise<FleetMovementView> {
    return this.tenants.runInTenant(tenantId, async (tx) => {
      const existing = await tx.fleetMovement.findFirst({ where: { id } });
      if (!existing) throw new NotFoundException('Movement not found');
      const data: Record<string, unknown> = { updatedByUserId: userId, updatedAt: new Date() };
      if (patch.driverName !== undefined) data.driverName = patch.driverName.trim();
      if (patch.driverPhone !== undefined) data.driverPhone = normPhone(patch.driverPhone);
      if (patch.ownerName !== undefined) data.ownerName = patch.ownerName.trim();
      if (patch.ownerPhone !== undefined) data.ownerPhone = normPhone(patch.ownerPhone);
      if (patch.carsInRego !== undefined) {
        data.carsInRego = normRego(patch.carsInRego);
        data.carsInRegoRaw = patch.carsInRego;
      }
      if (patch.carsOutRego !== undefined) {
        data.carsOutRego = normRego(patch.carsOutRego);
        data.carsOutRegoRaw = patch.carsOutRego;
      }
      if (patch.purpose !== undefined) data.purpose = patch.purpose;
      if (patch.movedAt !== undefined) data.movedAt = new Date(patch.movedAt);
      if (patch.status !== undefined) data.status = patch.status;
      if (patch.needsReview !== undefined) data.needsReview = patch.needsReview;
      if (patch.reviewReason !== undefined) data.reviewReason = patch.reviewReason;
      if (patch.notes !== undefined) data.notes = patch.notes;
      const row = await tx.fleetMovement.update({ where: { id }, data });
      await this.audit.recordIn(tx, {
        tenantId,
        actorUserId: userId,
        action: 'fleet.movement.updated',
        entityType: 'fleet_movement',
        entityId: id,
      });
      return toMovementView(row);
    });
  }

  async listMovements(
    tenantId: string,
    opts: { status?: FleetMovementStatus; limit?: number } = {},
  ): Promise<FleetMovementView[]> {
    return this.tenants.runInTenant(tenantId, async (tx) => {
      const rows = await tx.fleetMovement.findMany({
        where: opts.status ? { status: opts.status } : {},
        orderBy: { createdAt: 'desc' },
        take: opts.limit ?? 50,
      });
      return rows.map(toMovementView);
    });
  }

  /** Everything staff should be warned about before giving this car out. */
  async getRegoConflicts(tenantId: string, rego: string): Promise<RegoConflict> {
    const clean = normRego(rego);
    return this.tenants.runInTenant(tenantId, async (tx) => {
      const [vehicle, activeMovement, bookings] = await Promise.all([
        tx.fleetVehicle.findUnique({ where: { tenantId_rego: { tenantId, rego: clean } } }),
        tx.fleetMovement.findFirst({
          where: { carsOutRego: clean, status: 'active' },
          orderBy: { movedAt: 'desc' },
        }),
        tx.fleetBooking.findMany({
          where: { vehicleRego: clean, status: { in: ['booked', 'active'] } },
          orderBy: { startAt: 'asc' },
        }),
      ]);
      return {
        vehicle: vehicle ? toVehicleView(vehicle) : null,
        activeMovement: activeMovement ? toMovementView(activeMovement) : null,
        bookings: bookings.map(toBookingView),
      };
    });
  }

  // ============================================================ returns

  async createReturn(
    tenantId: string,
    userId: string,
    input: CreateReturnDto,
  ): Promise<{ ret: FleetReturnView; matchedMovement: FleetMovementView | null }> {
    const rego = normRego(input.returnedRego);
    return this.tenants.runInTenant(tenantId, async (tx) => {
      // Match the still-open movement that sent this rego out (explicit id wins, else newest active).
      const matched = input.movementId
        ? await tx.fleetMovement.findFirst({ where: { id: input.movementId } })
        : rego
          ? await tx.fleetMovement.findFirst({
              where: { carsOutRego: rego, status: 'active' },
              orderBy: { movedAt: 'desc' },
            })
          : null;
      let returnedVehicleId: string | null = null;
      if (rego) {
        const v = await this.ensureVehicleTx(tx, tenantId, rego, {
          isCompanyCar: true,
          regoRaw: input.returnedRego,
        });
        returnedVehicleId = v.id;
      }
      const row = await tx.fleetReturn.create({
        data: {
          tenantId,
          movementId: matched?.id ?? null,
          contactId: null,
          returnedVehicleId,
          returnedRego: rego,
          returnedRegoRaw: input.returnedRego,
          driverName: (input.driverName ?? '').trim(),
          mobileNumber: normPhone(input.mobileNumber ?? ''),
          returnedAt: input.returnedAt ? new Date(input.returnedAt) : new Date(),
          bondStatus: input.bondStatus ?? '',
          notes: input.notes ?? '',
          staffName: (input.staffName ?? '').trim(),
          createdByUserId: userId,
          updatedByUserId: userId,
        },
      });
      // Close the loop: mark the movement returned, free the car, complete any open booking on it.
      if (matched) {
        await tx.fleetMovement.update({
          where: { id: matched.id },
          data: { status: 'returned', updatedByUserId: userId, updatedAt: new Date() },
        });
      }
      if (rego) {
        await this.freeVehicleAfterReturnTx(tx, rego);
        await tx.fleetBooking.updateMany({
          where: { vehicleRego: rego, status: 'active' },
          data: { status: 'completed', updatedByUserId: userId, updatedAt: new Date() },
        });
      }
      await this.audit.recordIn(tx, {
        tenantId,
        actorUserId: userId,
        action: 'fleet.return.created',
        entityType: 'fleet_return',
        entityId: row.id,
      });
      return {
        ret: toReturnView(row),
        matchedMovement: matched ? toMovementView({ ...matched, status: 'returned' }) : null,
      };
    });
  }

  async getReturn(tenantId: string, id: string): Promise<FleetReturnView> {
    return this.tenants.runInTenant(tenantId, async (tx) => {
      const row = await tx.fleetReturn.findFirst({ where: { id } });
      if (!row) throw new NotFoundException('Return not found');
      return toReturnView(row);
    });
  }

  async updateReturn(
    tenantId: string,
    id: string,
    patch: UpdateReturnDto,
    userId: string,
  ): Promise<FleetReturnView> {
    return this.tenants.runInTenant(tenantId, async (tx) => {
      const existing = await tx.fleetReturn.findFirst({ where: { id } });
      if (!existing) throw new NotFoundException('Return not found');
      const data: Record<string, unknown> = { updatedByUserId: userId, updatedAt: new Date() };
      if (patch.driverName !== undefined) data.driverName = patch.driverName.trim();
      if (patch.mobileNumber !== undefined) data.mobileNumber = normPhone(patch.mobileNumber);
      if (patch.returnedAt !== undefined) data.returnedAt = new Date(patch.returnedAt);
      if (patch.bondStatus !== undefined) data.bondStatus = patch.bondStatus;
      if (patch.notes !== undefined) data.notes = patch.notes;
      if (patch.needsReview !== undefined) data.needsReview = patch.needsReview;
      if (patch.reviewReason !== undefined) data.reviewReason = patch.reviewReason;
      const row = await tx.fleetReturn.update({ where: { id }, data });
      await this.audit.recordIn(tx, {
        tenantId,
        actorUserId: userId,
        action: 'fleet.return.updated',
        entityType: 'fleet_return',
        entityId: id,
      });
      return toReturnView(row);
    });
  }

  async listReturns(tenantId: string, limit = 50): Promise<FleetReturnView[]> {
    return this.tenants.runInTenant(tenantId, async (tx) => {
      const rows = await tx.fleetReturn.findMany({
        orderBy: { createdAt: 'desc' },
        take: limit,
      });
      return rows.map(toReturnView);
    });
  }

  /**
   * Full "chain of custody" for a fleet car: every period it was out to a client. Each out-movement
   * (carsOutRego = rego) becomes a period paired with its return; explicit links win, then earliest-out
   * claims earliest-later-return. Unpaired returns are still surfaced. Newest first.
   */
  async listRentalHistoryByRego(tenantId: string, rego: string): Promise<RentalPeriod[]> {
    const clean = normRego(rego);
    if (!clean) return [];
    return this.tenants.runInTenant(tenantId, async (tx) => {
      const [movements, returns] = await Promise.all([
        tx.fleetMovement.findMany({ where: { carsOutRego: clean }, take: 500 }),
        tx.fleetReturn.findMany({ where: { returnedRego: clean }, take: 500 }),
      ]);
      return pairRentalHistory(movements, returns);
    });
  }

  // ============================================================ today / dashboard

  async listTodaysMovements(tenantId: string): Promise<FleetMovementView[]> {
    return this.tenants.runInTenant(tenantId, async (tx) => {
      const rows = await tx.fleetMovement.findMany({
        where: { createdAt: { gte: startOfToday() } },
        orderBy: { createdAt: 'desc' },
        take: 500,
      });
      return rows.map(toMovementView);
    });
  }

  async listTodaysReturns(tenantId: string): Promise<FleetReturnView[]> {
    return this.tenants.runInTenant(tenantId, async (tx) => {
      const rows = await tx.fleetReturn.findMany({
        where: {
          OR: [
            { createdAt: { gte: startOfToday() } },
            { returnedAt: { gte: startOfToday(), lte: endOfToday() } },
          ],
        },
        orderBy: { createdAt: 'desc' },
        take: 500,
      });
      return rows.map(toReturnView);
    });
  }

  async getDashboardStats(tenantId: string): Promise<FleetDashboardStats> {
    const t0 = startOfToday();
    const t24 = endOfToday();
    const now = new Date();
    return this.tenants.runInTenant(tenantId, async (tx) => {
      const [
        carsOut,
        returnedToday,
        goingOutToday,
        availableCars,
        bookedCars,
        overdue,
        revM,
        revR,
      ] = await Promise.all([
        tx.fleetMovement.count({ where: { status: 'active', carsOutRego: { not: '' } } }),
        tx.fleetReturn.count({ where: { returnedAt: { gte: t0, lte: t24 } } }),
        tx.fleetBooking.count({ where: { status: 'booked', startAt: { gte: t0, lte: t24 } } }),
        tx.fleetVehicle.count({ where: { status: 'available', isCompanyCar: true } }),
        tx.fleetBooking.count({ where: { status: 'booked' } }),
        tx.fleetBooking.count({ where: { status: 'active', expectedReturnAt: { lt: now } } }),
        tx.fleetMovement.count({ where: { needsReview: true } }),
        tx.fleetReturn.count({ where: { needsReview: true } }),
      ]);
      return {
        carsOut,
        returnedToday,
        goingOutToday,
        availableCars,
        bookedCars,
        overdue,
        needsAttention: revM + revR,
      };
    });
  }

  async recentActivity(tenantId: string, limit = 15): Promise<FleetActivity[]> {
    return this.tenants.runInTenant(tenantId, async (tx) => {
      const rows = await tx.auditLog.findMany({
        where: {
          entityType: { in: ['fleet_vehicle', 'fleet_movement', 'fleet_return', 'fleet_booking'] },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
      });
      return rows.map((r) => ({
        id: r.id,
        actorUserId: r.actorUserId,
        action: r.action,
        entityType: r.entityType,
        entityId: r.entityId,
        createdAt: r.createdAt.toISOString(),
      }));
    });
  }

  // ============================================================ bookings

  async createBooking(
    tenantId: string,
    userId: string,
    input: CreateBookingDto,
  ): Promise<FleetBookingView> {
    const rego = normRego(input.vehicleRego);
    return this.tenants.runInTenant(tenantId, async (tx) => {
      let vehicleId: string | null = null;
      if (rego) {
        const v = await this.ensureVehicleTx(tx, tenantId, rego, {
          isCompanyCar: true,
          regoRaw: input.vehicleRego,
        });
        vehicleId = v.id;
      }
      const row = await tx.fleetBooking.create({
        data: {
          tenantId,
          vehicleId,
          vehicleRego: rego,
          contactId: input.contactId ?? null,
          bookingName: (input.bookingName ?? '').trim(),
          bookingMobile: normPhone(input.bookingMobile ?? ''),
          startAt: new Date(input.startAt),
          expectedReturnAt: input.expectedReturnAt ? new Date(input.expectedReturnAt) : null,
          purpose: input.purpose ?? '',
          status: 'booked',
          notes: input.notes ?? '',
          createdByUserId: userId,
          updatedByUserId: userId,
        },
      });
      // Reflect the reservation on availability — but never override a car that's out or in repair.
      if (rego) {
        await tx.fleetVehicle.updateMany({
          where: { rego, status: { in: ['available', 'unknown'] } },
          data: { status: 'booked', updatedAt: new Date() },
        });
      }
      await this.audit.recordIn(tx, {
        tenantId,
        actorUserId: userId,
        action: 'fleet.booking.created',
        entityType: 'fleet_booking',
        entityId: row.id,
      });
      return toBookingView(row);
    });
  }

  async getBooking(tenantId: string, id: string): Promise<FleetBookingView> {
    return this.tenants.runInTenant(tenantId, async (tx) => {
      const row = await tx.fleetBooking.findFirst({ where: { id } });
      if (!row) throw new NotFoundException('Booking not found');
      return toBookingView(row);
    });
  }

  async updateBooking(
    tenantId: string,
    id: string,
    patch: UpdateBookingDto,
    userId: string,
  ): Promise<FleetBookingView> {
    return this.tenants.runInTenant(tenantId, async (tx) => {
      const existing = await tx.fleetBooking.findFirst({ where: { id } });
      if (!existing) throw new NotFoundException('Booking not found');
      const data: Record<string, unknown> = { updatedByUserId: userId, updatedAt: new Date() };
      if (patch.status !== undefined) data.status = patch.status;
      if (patch.startAt !== undefined) data.startAt = new Date(patch.startAt);
      if (patch.expectedReturnAt !== undefined)
        data.expectedReturnAt = new Date(patch.expectedReturnAt);
      if (patch.purpose !== undefined) data.purpose = patch.purpose;
      if (patch.notes !== undefined) data.notes = patch.notes;
      if (patch.bookingName !== undefined) data.bookingName = patch.bookingName.trim();
      if (patch.bookingMobile !== undefined) data.bookingMobile = normPhone(patch.bookingMobile);
      const row = await tx.fleetBooking.update({ where: { id }, data });
      await this.audit.recordIn(tx, {
        tenantId,
        actorUserId: userId,
        action: 'fleet.booking.updated',
        entityType: 'fleet_booking',
        entityId: id,
      });
      return toBookingView(row);
    });
  }

  async listBookings(
    tenantId: string,
    statuses: FleetBookingStatus[] = ['booked', 'active'],
  ): Promise<FleetBookingView[]> {
    return this.tenants.runInTenant(tenantId, async (tx) => {
      const rows = await tx.fleetBooking.findMany({
        where: { status: { in: statuses } },
        orderBy: { startAt: 'asc' },
      });
      return rows.map(toBookingView);
    });
  }

  /** Cancel a booking and free its reserved car if nothing else holds it. */
  async cancelBooking(tenantId: string, id: string, userId: string): Promise<FleetBookingView> {
    return this.tenants.runInTenant(tenantId, async (tx) => {
      const booking = await tx.fleetBooking.findFirst({ where: { id } });
      if (!booking) throw new NotFoundException('Booking not found');
      const row = await tx.fleetBooking.update({
        where: { id },
        data: { status: 'cancelled', updatedByUserId: userId, updatedAt: new Date() },
      });
      // Only downgrade a car that is currently 'booked' and has no active movement / other open booking.
      const rego = booking.vehicleRego;
      if (rego) {
        const [activeMovement, otherBookings] = await Promise.all([
          tx.fleetMovement.findFirst({ where: { carsOutRego: rego, status: 'active' } }),
          tx.fleetBooking.count({
            where: { vehicleRego: rego, status: { in: ['booked', 'active'] }, id: { not: id } },
          }),
        ]);
        if (!activeMovement && otherBookings === 0) {
          await tx.fleetVehicle.updateMany({
            where: { rego, status: 'booked' },
            data: { status: 'available', updatedAt: new Date() },
          });
        }
      }
      await this.audit.recordIn(tx, {
        tenantId,
        actorUserId: userId,
        action: 'fleet.booking.cancelled',
        entityType: 'fleet_booking',
        entityId: id,
      });
      return toBookingView(row);
    });
  }

  /** Turn a booking into a movement (the car actually goes out) — one-tap convert. */
  async convertBookingToMovement(
    tenantId: string,
    id: string,
    userId: string,
  ): Promise<FleetMovementView> {
    const booking = await this.getBooking(tenantId, id);
    if (booking.status === 'cancelled' || booking.status === 'completed')
      throw new BadRequestException(`This booking is already ${booking.status}`);
    const movement = await this.createMovement(tenantId, userId, {
      driverName: booking.bookingName,
      driverPhone: booking.bookingMobile,
      carsOutRego: booking.vehicleRego,
      purpose: booking.purpose,
      notes: booking.notes,
    });
    await this.updateBooking(tenantId, id, { status: 'active' }, userId);
    return movement;
  }

  // ============================================================ needs review

  async listNeedsReview(
    tenantId: string,
  ): Promise<{ movements: FleetMovementView[]; returns: FleetReturnView[] }> {
    return this.tenants.runInTenant(tenantId, async (tx) => {
      const [movements, returns] = await Promise.all([
        tx.fleetMovement.findMany({
          where: { needsReview: true },
          orderBy: { createdAt: 'desc' },
          take: 500,
        }),
        tx.fleetReturn.findMany({
          where: { needsReview: true },
          orderBy: { createdAt: 'desc' },
          take: 500,
        }),
      ]);
      return { movements: movements.map(toMovementView), returns: returns.map(toReturnView) };
    });
  }

  async markAllReviewed(tenantId: string, userId: string): Promise<{ cleared: number }> {
    return this.tenants.runInTenant(tenantId, async (tx) => {
      const [m, r] = await Promise.all([
        tx.fleetMovement.updateMany({
          where: { needsReview: true },
          data: { needsReview: false, reviewReason: '', updatedByUserId: userId },
        }),
        tx.fleetReturn.updateMany({
          where: { needsReview: true },
          data: { needsReview: false, reviewReason: '', updatedByUserId: userId },
        }),
      ]);
      return { cleared: m.count + r.count };
    });
  }

  // ============================================================ search

  async universalSearch(tenantId: string, term: string): Promise<FleetSearchResults> {
    const t = term.trim();
    if (!t) return { movements: [], returns: [], vehicles: [], bookings: [] };
    const rego = normRego(t);
    const phone = normPhone(t);
    const phoneOk = phone.length >= 6; // avoid a short rego matching every phone
    const ci = (s: string) => ({ contains: s, mode: 'insensitive' as const });
    return this.tenants.runInTenant(tenantId, async (tx) => {
      const [movements, returns, vehicles, bookings] = await Promise.all([
        tx.fleetMovement.findMany({
          where: {
            OR: [
              ...(rego ? [{ carsInRego: ci(rego) }, { carsOutRego: ci(rego) }] : []),
              { driverName: ci(t) },
              { ownerName: ci(t) },
              { purpose: ci(t) },
              { notes: ci(t) },
              ...(phoneOk ? [{ driverPhone: ci(phone) }, { ownerPhone: ci(phone) }] : []),
            ],
          },
          orderBy: { createdAt: 'desc' },
          take: 30,
        }),
        tx.fleetReturn.findMany({
          where: {
            OR: [
              ...(rego ? [{ returnedRego: ci(rego) }] : []),
              { driverName: ci(t) },
              { notes: ci(t) },
              { bondStatus: ci(t) },
              ...(phoneOk ? [{ mobileNumber: ci(phone) }] : []),
            ],
          },
          orderBy: { createdAt: 'desc' },
          take: 30,
        }),
        tx.fleetVehicle.findMany({
          where: {
            OR: [
              ...(rego ? [{ rego: ci(rego) }] : []),
              { make: ci(t) },
              { model: ci(t) },
              { vehicleType: ci(t) },
            ],
          },
          take: 20,
        }),
        tx.fleetBooking.findMany({
          where: {
            OR: [
              ...(rego ? [{ vehicleRego: ci(rego) }] : []),
              { bookingName: ci(t) },
              { purpose: ci(t) },
              { notes: ci(t) },
              ...(phoneOk ? [{ bookingMobile: ci(phone) }] : []),
            ],
          },
          orderBy: { startAt: 'desc' },
          take: 20,
        }),
      ]);
      return {
        movements: movements.map(toMovementView),
        returns: returns.map(toReturnView),
        vehicles: vehicles.map(toVehicleView),
        bookings: bookings.map(toBookingView),
      };
    });
  }
}

// ------------------------------------------------------------------ row → view

type VehicleRow = {
  id: string;
  rego: string;
  regoRaw: string;
  make: string;
  model: string;
  vehicleType: string;
  status: string;
  isCompanyCar: boolean;
  notes: string;
  createdAt: Date;
  updatedAt: Date;
};
function toVehicleView(r: VehicleRow): FleetVehicleView {
  return {
    id: r.id,
    rego: r.rego,
    regoRaw: r.regoRaw,
    make: r.make,
    model: r.model,
    vehicleType: r.vehicleType,
    status: r.status as FleetVehicleStatus,
    isCompanyCar: r.isCompanyCar,
    notes: r.notes,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

type MovementRow = {
  id: string;
  contactId: string | null;
  driverName: string;
  driverPhone: string;
  ownerName: string;
  ownerPhone: string;
  carsInRego: string;
  carsInRegoRaw: string;
  carsOutVehicleId: string | null;
  carsOutRego: string;
  carsOutRegoRaw: string;
  purpose: string;
  movedAt: Date | null;
  status: string;
  needsReview: boolean;
  reviewReason: string;
  notes: string;
  staffName: string;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
};
function toMovementView(r: MovementRow): FleetMovementView {
  return {
    id: r.id,
    contactId: r.contactId,
    driverName: r.driverName,
    driverPhone: r.driverPhone,
    ownerName: r.ownerName,
    ownerPhone: r.ownerPhone,
    carsInRego: r.carsInRego,
    carsInRegoRaw: r.carsInRegoRaw,
    carsOutVehicleId: r.carsOutVehicleId,
    carsOutRego: r.carsOutRego,
    carsOutRegoRaw: r.carsOutRegoRaw,
    purpose: r.purpose,
    movedAt: iso(r.movedAt),
    status: r.status as FleetMovementStatus,
    needsReview: r.needsReview,
    reviewReason: r.reviewReason,
    notes: r.notes,
    staffName: r.staffName,
    createdByUserId: r.createdByUserId,
    updatedByUserId: r.updatedByUserId,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

type ReturnRow = {
  id: string;
  movementId: string | null;
  contactId: string | null;
  returnedVehicleId: string | null;
  returnedRego: string;
  returnedRegoRaw: string;
  driverName: string;
  mobileNumber: string;
  returnedAt: Date | null;
  bondStatus: string;
  notes: string;
  staffName: string;
  needsReview: boolean;
  reviewReason: string;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
};
function toReturnView(r: ReturnRow): FleetReturnView {
  return {
    id: r.id,
    movementId: r.movementId,
    contactId: r.contactId,
    returnedVehicleId: r.returnedVehicleId,
    returnedRego: r.returnedRego,
    returnedRegoRaw: r.returnedRegoRaw,
    driverName: r.driverName,
    mobileNumber: r.mobileNumber,
    returnedAt: iso(r.returnedAt),
    bondStatus: r.bondStatus,
    notes: r.notes,
    staffName: r.staffName,
    needsReview: r.needsReview,
    reviewReason: r.reviewReason,
    createdByUserId: r.createdByUserId,
    updatedByUserId: r.updatedByUserId,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

type BookingRow = {
  id: string;
  vehicleId: string | null;
  vehicleRego: string;
  contactId: string | null;
  bookingName: string;
  bookingMobile: string;
  startAt: Date;
  expectedReturnAt: Date | null;
  purpose: string;
  status: string;
  notes: string;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
};
function toBookingView(r: BookingRow): FleetBookingView {
  return {
    id: r.id,
    vehicleId: r.vehicleId,
    vehicleRego: r.vehicleRego,
    contactId: r.contactId,
    bookingName: r.bookingName,
    bookingMobile: r.bookingMobile,
    startAt: r.startAt.toISOString(),
    expectedReturnAt: iso(r.expectedReturnAt),
    purpose: r.purpose,
    status: r.status as FleetBookingStatus,
    notes: r.notes,
    createdByUserId: r.createdByUserId,
    updatedByUserId: r.updatedByUserId,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

// ------------------------------------------------------------------ rental-history pairing (pure)

const DAY = 86_400_000;
const tsOf = (d: Date | null | undefined): number => (d ? d.getTime() : NaN);

/** Pure chain-of-custody pairing — exported for unit tests. Mirrors the legacy app's algorithm. */
export function pairRentalHistory(movements: MovementRow[], returns: ReturnRow[]): RentalPeriod[] {
  const outTs = (m: MovementRow) => tsOf(m.movedAt ?? m.createdAt);
  const backTs = (r: ReturnRow) => tsOf(r.returnedAt ?? r.createdAt);

  const movementIds = new Set(movements.map((m) => m.id));
  const pairOf = new Map<string, ReturnRow>();
  const usedReturns = new Set<string>();

  // 1. Explicit links first.
  for (const r of returns) {
    if (r.movementId && movementIds.has(r.movementId) && !pairOf.has(r.movementId)) {
      pairOf.set(r.movementId, r);
      usedReturns.add(r.id);
    }
  }

  // 2. Chronological pairing for the rest — earliest out claims the earliest still-unused later return.
  const movesByOut = [...movements].sort((a, b) => outTs(a) - outTs(b));
  const returnsByBack = [...returns].sort((a, b) => backTs(a) - backTs(b));
  for (const m of movesByOut) {
    if (pairOf.has(m.id)) continue;
    const out = outTs(m);
    const match = returnsByBack.find(
      (r) => !usedReturns.has(r.id) && (isNaN(out) || backTs(r) >= out - DAY),
    );
    if (match) {
      pairOf.set(m.id, match);
      usedReturns.add(match.id);
    }
  }

  const periods: RentalPeriod[] = movements.map((m) => {
    const r = pairOf.get(m.id) ?? null;
    return {
      id: m.id,
      movementId: m.id,
      returnId: r?.id ?? null,
      driverName: m.driverName || r?.driverName || '',
      driverPhone: m.driverPhone || r?.mobileNumber || '',
      purpose: m.purpose,
      outAt: iso(m.movedAt ?? m.createdAt),
      backAt: r ? iso(r.returnedAt) : null,
      ongoing: m.status === 'active' && !r,
      notes: m.notes || '',
      returnNotes: r?.notes || '',
    };
  });

  // Returns we couldn't pair to any out-movement — surface so nothing is lost.
  for (const r of returns) {
    if (usedReturns.has(r.id)) continue;
    periods.push({
      id: r.id,
      movementId: null,
      returnId: r.id,
      driverName: r.driverName || '',
      driverPhone: r.mobileNumber || '',
      purpose: '',
      outAt: null,
      backAt: iso(r.returnedAt),
      ongoing: false,
      notes: '',
      returnNotes: r.notes || '',
    });
  }

  periods.sort((a, b) => (b.outAt ?? b.backAt ?? '').localeCompare(a.outAt ?? a.backAt ?? ''));
  return periods;
}
