import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { TenantService } from '../tenancy/tenant.service';

export type ResourceType = 'bay' | 'technician';

export interface ResourceView {
  id: string;
  type: ResourceType;
  name: string;
}

/**
 * Bookable resources — bays, technicians (card #23). A shop sets these up; bookings reserve them. Part
 * of the toggleable `scheduling` module. Tenant-scoped through the central wrapper.
 */
@Injectable()
export class ResourceService {
  constructor(private readonly tenants: TenantService) {}

  async create(tenantId: string, type: ResourceType, name: string): Promise<ResourceView> {
    if (!name?.trim()) throw new BadRequestException('name is required');
    return this.tenants.runInTenant(tenantId, async (tx) => {
      const r = await tx.resource.create({ data: { tenantId, type, name: name.trim() } });
      return toResourceView(r);
    });
  }

  async list(tenantId: string): Promise<ResourceView[]> {
    return this.tenants.runInTenant(tenantId, async (tx) => {
      const rows = await tx.resource.findMany({
        where: { deletedAt: null },
        orderBy: { name: 'asc' },
      });
      return rows.map(toResourceView);
    });
  }

  async rename(tenantId: string, id: string, name: string): Promise<ResourceView> {
    if (!name?.trim()) throw new BadRequestException('name is required');
    await this.tenants.runInTenant(tenantId, async (tx) => {
      const res = await tx.resource.updateMany({
        where: { id, deletedAt: null },
        data: { name: name.trim() },
      });
      if (res.count !== 1) throw new NotFoundException('Resource not found');
    });
    return this.get(tenantId, id);
  }

  async get(tenantId: string, id: string): Promise<ResourceView> {
    const r = await this.tenants.runInTenant(tenantId, (tx) =>
      tx.resource.findFirst({ where: { id, deletedAt: null } }),
    );
    if (!r) throw new NotFoundException('Resource not found');
    return toResourceView(r);
  }

  /**
   * Delete a resource. If it still has bookings this is refused (409) unless `force` — matching the
   * card's "deleting a resource that has bookings → warn first". With force, its bookings go too.
   */
  async remove(tenantId: string, id: string, force = false): Promise<void> {
    await this.tenants.runInTenant(tenantId, async (tx) => {
      const r = await tx.resource.findFirst({ where: { id, deletedAt: null } });
      if (!r) throw new NotFoundException('Resource not found');
      const bookingCount = await tx.booking.count({ where: { resourceId: id } });
      if (bookingCount > 0 && !force)
        throw new ConflictException(
          `Resource has ${bookingCount} booking(s) — pass force to delete them too`,
        );
      if (bookingCount > 0) await tx.booking.deleteMany({ where: { resourceId: id } });
      await tx.resource.updateMany({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}

function toResourceView(r: { id: string; type: string; name: string }): ResourceView {
  return { id: r.id, type: r.type as ResourceType, name: r.name };
}
