import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { TenantService } from '../tenancy/tenant.service';
import { AddFleetPhotoDto } from './dto/fleet.dto';
import { FLEET_PHOTO_STORAGE, FleetPhotoStorage } from './fleet-photo-storage';

export interface FleetPhotoView {
  id: string;
  vehicleId: string | null;
  movementId: string | null;
  returnId: string | null;
  bookingId: string | null;
  photoType: string;
  contentType: string;
  notes: string;
  uploadedByUserId: string | null;
  uploadedAt: string;
}

export interface FleetPhotoFilter {
  vehicleId?: string;
  movementId?: string;
  returnId?: string;
  bookingId?: string;
}

/**
 * Before/after (and damage/odometer/fuel) photos for the fleet domain. Bytes are stored in private Storage
 * under a tenant-prefixed ref; the DB row carries the metadata + link to a vehicle/movement/return/booking.
 * Tenant-scoped throughout; the content endpoint streams bytes only after the row is found under RLS.
 */
@Injectable()
export class FleetPhotoService {
  constructor(
    private readonly tenants: TenantService,
    @Inject(FLEET_PHOTO_STORAGE) private readonly storage: FleetPhotoStorage,
  ) {}

  async add(tenantId: string, userId: string, input: AddFleetPhotoDto): Promise<FleetPhotoView> {
    if (!input.movementId && !input.returnId && !input.bookingId && !input.vehicleId)
      throw new BadRequestException('A photo must link to a vehicle, movement, return or booking');
    let bytes: Buffer;
    try {
      bytes = Buffer.from(input.dataBase64, 'base64');
    } catch {
      throw new BadRequestException('dataBase64 is not valid base64');
    }
    if (bytes.length === 0) throw new BadRequestException('Empty photo');
    const contentType = input.contentType ?? 'image/jpeg';

    // Check the parent EXISTS before writing any bytes. Uploading first meant a bad id left the file in
    // storage with no row pointing at it — unreferenced, uncleanable, and billed for — while the caller
    // got an opaque 500 from the foreign-key violation instead of a useful error.
    await this.tenants.runInTenant(tenantId, async (tx) => {
      const missing = await this.findMissingParent(tx, input);
      if (missing) throw new NotFoundException(`${missing} not found`);
    });

    const storagePath = await this.storage.put(tenantId, bytes, contentType);
    try {
      return await this.tenants.runInTenant(tenantId, async (tx) => {
        const row = await tx.fleetPhoto.create({
          data: {
            tenantId,
            vehicleId: input.vehicleId ?? null,
            movementId: input.movementId ?? null,
            returnId: input.returnId ?? null,
            bookingId: input.bookingId ?? null,
            photoType: input.photoType,
            storagePath,
            contentType,
            notes: input.notes ?? '',
            uploadedByUserId: userId,
          },
        });
        return toPhotoView(row);
      });
    } catch (err) {
      // The check above closes the ordinary case; this covers a parent deleted in the gap, or any other
      // write failure. Without it the bytes would still be stranded.
      await this.storage.remove(tenantId, storagePath).catch(() => {});
      throw err;
    }
  }

  /** Name of the first referenced record that does not exist in this tenant, or null when all are fine. */
  private async findMissingParent(
    tx: {
      fleetVehicle: { findFirst(a: unknown): Promise<unknown> };
      fleetMovement: { findFirst(a: unknown): Promise<unknown> };
      fleetReturn: { findFirst(a: unknown): Promise<unknown> };
      fleetBooking: { findFirst(a: unknown): Promise<unknown> };
    },
    input: AddFleetPhotoDto,
  ): Promise<string | null> {
    const checks: [string | undefined, () => Promise<unknown>, string][] = [
      [
        input.vehicleId,
        () => tx.fleetVehicle.findFirst({ where: { id: input.vehicleId } }),
        'Vehicle',
      ],
      [
        input.movementId,
        () => tx.fleetMovement.findFirst({ where: { id: input.movementId } }),
        'Movement',
      ],
      [input.returnId, () => tx.fleetReturn.findFirst({ where: { id: input.returnId } }), 'Return'],
      [
        input.bookingId,
        () => tx.fleetBooking.findFirst({ where: { id: input.bookingId } }),
        'Booking',
      ],
    ];
    for (const [id, load, label] of checks) {
      if (id && !(await load())) return label;
    }
    return null;
  }

  async list(tenantId: string, filter: FleetPhotoFilter): Promise<FleetPhotoView[]> {
    const where: Record<string, unknown> = {};
    if (filter.movementId) where.movementId = filter.movementId;
    if (filter.returnId) where.returnId = filter.returnId;
    if (filter.bookingId) where.bookingId = filter.bookingId;

    return this.tenants.runInTenant(tenantId, async (tx) => {
      if (filter.vehicleId) {
        // Photos are taken at a handover, so they hang off the MOVEMENT, not the car: of 3541 imported
        // photos only 9 carry a vehicleId. Matching the column alone therefore returned nothing for
        // essentially every vehicle, and the car's whole photo history was unreachable in the UI.
        //
        // Reach them the way the data actually joins: the car's own photos, plus those on its movements
        // and returns. Those link by id where one was resolved at import, and otherwise by rego — which
        // is the only link the legacy spreadsheet had.
        const vehicle = await tx.fleetVehicle.findFirst({ where: { id: filter.vehicleId } });
        if (!vehicle) return [];
        const rego = vehicle.rego?.trim() ? vehicle.rego : null;

        const [movements, returns] = await Promise.all([
          tx.fleetMovement.findMany({
            where: {
              OR: [
                { carsOutVehicleId: filter.vehicleId },
                ...(rego ? [{ carsOutRego: rego }] : []),
              ],
            },
            select: { id: true },
          }),
          tx.fleetReturn.findMany({
            where: {
              OR: [
                { returnedVehicleId: filter.vehicleId },
                ...(rego ? [{ returnedRego: rego }] : []),
              ],
            },
            select: { id: true },
          }),
        ]);

        where.OR = [
          { vehicleId: filter.vehicleId },
          ...(movements.length ? [{ movementId: { in: movements.map((m) => m.id) } }] : []),
          ...(returns.length ? [{ returnId: { in: returns.map((r) => r.id) } }] : []),
        ];
      }

      const rows = await tx.fleetPhoto.findMany({
        where,
        orderBy: { uploadedAt: 'desc' },
      });
      return rows.map(toPhotoView);
    });
  }

  async getContent(tenantId: string, id: string): Promise<{ bytes: Buffer; contentType: string }> {
    const row = await this.tenants.runInTenant(tenantId, (tx) =>
      tx.fleetPhoto.findFirst({ where: { id } }),
    );
    if (!row) throw new NotFoundException('Photo not found');
    const bytes = await this.storage.get(tenantId, row.storagePath);
    return { bytes, contentType: row.contentType };
  }

  async remove(tenantId: string, id: string): Promise<void> {
    const row = await this.tenants.runInTenant(tenantId, async (tx) => {
      const found = await tx.fleetPhoto.findFirst({ where: { id } });
      if (found) await tx.fleetPhoto.delete({ where: { id } });
      return found;
    });
    if (row) await this.storage.remove(tenantId, row.storagePath).catch(() => {});
  }
}

function toPhotoView(r: {
  id: string;
  vehicleId: string | null;
  movementId: string | null;
  returnId: string | null;
  bookingId: string | null;
  photoType: string;
  contentType: string;
  notes: string;
  uploadedByUserId: string | null;
  uploadedAt: Date;
}): FleetPhotoView {
  return {
    id: r.id,
    vehicleId: r.vehicleId,
    movementId: r.movementId,
    returnId: r.returnId,
    bookingId: r.bookingId,
    photoType: r.photoType,
    contentType: r.contentType,
    notes: r.notes,
    uploadedByUserId: r.uploadedByUserId,
    uploadedAt: r.uploadedAt.toISOString(),
  };
}
