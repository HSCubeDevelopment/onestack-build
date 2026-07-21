import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { TenantService } from '../tenancy/tenant.service';
import { CreateYardDropDto, CreateYardDto, UpdateYardDto } from './dto/yards.dto';
import { normRego } from './yards.util';

export interface YardView {
  id: string;
  name: string;
  latitude: number | null;
  longitude: number | null;
  createdAt: string;
}

export interface YardDropView {
  id: string;
  yardId: string;
  yardName: string;
  rego: string;
  comments: string | null;
  status: string;
  droppedAt: string;
  collectedAt: string | null;
}

export interface YardDashboardStats {
  yards: number;
  inYards: number;
}

/**
 * Yards & vehicle logistics (YRD-1). A shop parks incoming cars at its yards before a job exists, so
 * every car is traceable from the moment it lands. GENERIC core (Scheduling & Ops) — nothing here
 * touches another module's tables. Every query is tenant-scoped through `runInTenant`.
 */
@Injectable()
export class YardsService {
  constructor(
    private readonly tenants: TenantService,
    private readonly audit: AuditService,
  ) {}

  async listYards(tenantId: string): Promise<YardView[]> {
    return this.tenants.runInTenant(tenantId, async (tx) => {
      const rows = await tx.yard.findMany({
        where: { deletedAt: null },
        orderBy: { name: 'asc' },
      });
      return rows.map(toYardView);
    });
  }

  async createYard(tenantId: string, userId: string, dto: CreateYardDto): Promise<YardView> {
    const name = dto.name.trim();
    if (!name) throw new BadRequestException('Yard name is required');
    return this.tenants.runInTenant(tenantId, async (tx) => {
      const existing = await tx.yard.findFirst({ where: { name, deletedAt: null } });
      if (existing) throw new BadRequestException(`A yard named "${name}" already exists`);
      const row = await tx.yard.create({
        data: {
          tenantId,
          name,
          latitude: dto.latitude ?? null,
          longitude: dto.longitude ?? null,
        },
      });
      await this.audit.recordIn(tx, {
        tenantId,
        actorUserId: userId,
        action: 'yard.created',
        entityType: 'yard',
        entityId: row.id,
      });
      return toYardView(row);
    });
  }

  async updateYard(
    tenantId: string,
    userId: string,
    id: string,
    dto: UpdateYardDto,
  ): Promise<YardView> {
    return this.tenants.runInTenant(tenantId, async (tx) => {
      const current = await tx.yard.findFirst({ where: { id, deletedAt: null } });
      if (!current) throw new NotFoundException('Yard not found');
      const name = dto.name?.trim();
      const row = await tx.yard.update({
        where: { id },
        data: {
          name: name ?? undefined,
          latitude: dto.latitude ?? undefined,
          longitude: dto.longitude ?? undefined,
          updatedAt: new Date(),
        },
      });
      await this.audit.recordIn(tx, {
        tenantId,
        actorUserId: userId,
        action: 'yard.updated',
        entityType: 'yard',
        entityId: id,
      });
      return toYardView(row);
    });
  }

  /** Soft-delete a yard. Its drops persist (they reference a yard that is merely hidden). */
  async deleteYard(tenantId: string, userId: string, id: string): Promise<void> {
    await this.tenants.runInTenant(tenantId, async (tx) => {
      const current = await tx.yard.findFirst({ where: { id, deletedAt: null } });
      if (!current) throw new NotFoundException('Yard not found');
      await tx.yard.update({ where: { id }, data: { deletedAt: new Date() } });
      await this.audit.recordIn(tx, {
        tenantId,
        actorUserId: userId,
        action: 'yard.deleted',
        entityType: 'yard',
        entityId: id,
      });
    });
  }

  /** Cars currently parked ("Awaiting in yards"), oldest first, with their yard name. */
  async listAwaiting(tenantId: string): Promise<YardDropView[]> {
    return this.tenants.runInTenant(tenantId, async (tx) => {
      const rows = await tx.yardDrop.findMany({
        where: { status: 'in_yard' },
        orderBy: { droppedAt: 'asc' },
        include: { yard: { select: { name: true } } },
      });
      return rows.map(toDropView);
    });
  }

  async dropCar(tenantId: string, userId: string, dto: CreateYardDropDto): Promise<YardDropView> {
    const rego = normRego(dto.rego);
    if (!rego) throw new BadRequestException('A rego is required');
    return this.tenants.runInTenant(tenantId, async (tx) => {
      const yard = await tx.yard.findFirst({ where: { id: dto.yardId, deletedAt: null } });
      if (!yard) throw new NotFoundException('Yard not found');
      const row = await tx.yardDrop.create({
        data: {
          tenantId,
          yardId: dto.yardId,
          rego,
          comments: dto.comments?.trim() || null,
          status: 'in_yard',
        },
        include: { yard: { select: { name: true } } },
      });
      await this.audit.recordIn(tx, {
        tenantId,
        actorUserId: userId,
        action: 'yard.drop.created',
        entityType: 'yard_drop',
        entityId: row.id,
        metadata: { rego, yardId: dto.yardId },
      });
      return toDropView(row);
    });
  }

  async collectDrop(tenantId: string, userId: string, id: string): Promise<YardDropView> {
    return this.tenants.runInTenant(tenantId, async (tx) => {
      const current = await tx.yardDrop.findFirst({ where: { id } });
      if (!current) throw new NotFoundException('Yard drop not found');
      const row = await tx.yardDrop.update({
        where: { id },
        data: { status: 'collected', collectedAt: new Date(), updatedAt: new Date() },
        include: { yard: { select: { name: true } } },
      });
      await this.audit.recordIn(tx, {
        tenantId,
        actorUserId: userId,
        action: 'yard.drop.collected',
        entityType: 'yard_drop',
        entityId: id,
      });
      return toDropView(row);
    });
  }

  async getDrop(tenantId: string, id: string): Promise<YardDropView> {
    return this.tenants.runInTenant(tenantId, async (tx) => {
      const row = await tx.yardDrop.findFirst({
        where: { id },
        include: { yard: { select: { name: true } } },
      });
      if (!row) throw new NotFoundException('Yard drop not found');
      return toDropView(row);
    });
  }

  /** For the owner dashboard KPI "In yards" — matches the awaiting list count. */
  async countInYards(tenantId: string): Promise<number> {
    return this.tenants.runInTenant(tenantId, (tx) =>
      tx.yardDrop.count({ where: { status: 'in_yard' } }),
    );
  }

  async getDashboardStats(tenantId: string): Promise<YardDashboardStats> {
    return this.tenants.runInTenant(tenantId, async (tx) => {
      const [yards, inYards] = await Promise.all([
        tx.yard.count({ where: { deletedAt: null } }),
        tx.yardDrop.count({ where: { status: 'in_yard' } }),
      ]);
      return { yards, inYards };
    });
  }
}

type YardRow = {
  id: string;
  name: string;
  latitude: number | null;
  longitude: number | null;
  createdAt: Date;
};
function toYardView(r: YardRow): YardView {
  return {
    id: r.id,
    name: r.name,
    latitude: r.latitude,
    longitude: r.longitude,
    createdAt: r.createdAt.toISOString(),
  };
}

type DropRow = {
  id: string;
  yardId: string;
  rego: string;
  comments: string | null;
  status: string;
  droppedAt: Date;
  collectedAt: Date | null;
  yard: { name: string };
};
function toDropView(r: DropRow): YardDropView {
  return {
    id: r.id,
    yardId: r.yardId,
    yardName: r.yard.name,
    rego: r.rego,
    comments: r.comments,
    status: r.status,
    droppedAt: r.droppedAt.toISOString(),
    collectedAt: r.collectedAt ? r.collectedAt.toISOString() : null,
  };
}
