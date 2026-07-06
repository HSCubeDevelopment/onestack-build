import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { TenantService } from '../tenancy/tenant.service';

export interface NoteView {
  id: string;
  workItemId: string;
  authorUserId: string;
  body: string;
  createdAt: Date;
}

/**
 * Running notes on a work item (card #21). Each note records its author + timestamp and is immutable —
 * the log is append-only, listed newest-first. Tenant-scoped through the central wrapper.
 */
@Injectable()
export class NoteService {
  constructor(private readonly tenants: TenantService) {}

  async add(
    tenantId: string,
    workItemId: string,
    authorUserId: string,
    body: string,
  ): Promise<NoteView> {
    const text = body?.trim();
    if (!text) throw new BadRequestException('Note body is required');
    return this.tenants.runInTenant(tenantId, async (tx) => {
      const wi = await tx.workItem.findFirst({ where: { id: workItemId, deletedAt: null } });
      if (!wi) throw new NotFoundException('Work item not found');
      const note = await tx.workItemNote.create({
        data: { tenantId, workItemId, authorUserId, body: text },
      });
      return toNoteView(note);
    });
  }

  async list(tenantId: string, workItemId: string): Promise<NoteView[]> {
    return this.tenants.runInTenant(tenantId, async (tx) => {
      const wi = await tx.workItem.findFirst({ where: { id: workItemId, deletedAt: null } });
      if (!wi) throw new NotFoundException('Work item not found');
      const rows = await tx.workItemNote.findMany({
        where: { workItemId },
        orderBy: { createdAt: 'desc' },
      });
      return rows.map(toNoteView);
    });
  }
}

function toNoteView(n: {
  id: string;
  workItemId: string;
  authorUserId: string;
  body: string;
  createdAt: Date;
}): NoteView {
  return {
    id: n.id,
    workItemId: n.workItemId,
    authorUserId: n.authorUserId,
    body: n.body,
    createdAt: n.createdAt,
  };
}
