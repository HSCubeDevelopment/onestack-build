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
    const storagePath = await this.storage.put(tenantId, bytes, contentType);
    return this.tenants.runInTenant(tenantId, async (tx) => {
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
  }

  async list(tenantId: string, filter: FleetPhotoFilter): Promise<FleetPhotoView[]> {
    const where: Record<string, string> = {};
    if (filter.vehicleId) where.vehicleId = filter.vehicleId;
    if (filter.movementId) where.movementId = filter.movementId;
    if (filter.returnId) where.returnId = filter.returnId;
    if (filter.bookingId) where.bookingId = filter.bookingId;
    return this.tenants.runInTenant(tenantId, async (tx) => {
      const rows = await tx.fleetPhoto.findMany({
        where,
        orderBy: { uploadedAt: 'desc' },
      });
      return rows.map(toPhotoView);
    });
  }

  async getContent(
    tenantId: string,
    id: string,
  ): Promise<{ bytes: Buffer; contentType: string }> {
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
