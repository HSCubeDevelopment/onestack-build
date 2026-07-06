import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { TenantService } from '../tenancy/tenant.service';
import { ATTACHMENT_STORAGE, AttachmentStorage } from './attachment-storage';

/** Common image formats staff photograph a car/damage/work in. HEIC covers iPhone photos. */
const ALLOWED_CONTENT_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);
const MAX_BYTES = 15 * 1024 * 1024; // 15 MB — a reasonable phone-photo ceiling.

export interface AttachmentInput {
  fileName: string;
  contentType: string;
  dataBase64: string;
  caption?: string;
}

export interface AttachmentView {
  id: string;
  workItemId: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  caption: string | null;
  uploadedByUserId: string;
  createdAt: Date;
}

/**
 * Photo/file attachments on a work item (card #21). Bytes are stored in Supabase Storage under a
 * per-tenant path; the DB row holds the metadata. Uploads are validated (image type + size) before any
 * bytes are written. Content retrieval and delete are tenant-scoped via the central wrapper AND the
 * storage prefix check.
 */
@Injectable()
export class AttachmentService {
  constructor(
    private readonly tenants: TenantService,
    @Inject(ATTACHMENT_STORAGE) private readonly storage: AttachmentStorage,
  ) {}

  async add(
    tenantId: string,
    workItemId: string,
    uploadedByUserId: string,
    input: AttachmentInput,
  ): Promise<AttachmentView> {
    if (!ALLOWED_CONTENT_TYPES.has(input.contentType))
      throw new BadRequestException(
        `Unsupported file type "${input.contentType}" — use JPEG, PNG, WebP or HEIC`,
      );
    if (!input.fileName?.trim()) throw new BadRequestException('fileName is required');

    let bytes: Buffer;
    try {
      bytes = Buffer.from(input.dataBase64, 'base64');
    } catch {
      throw new BadRequestException('dataBase64 is not valid base64');
    }
    if (bytes.length === 0) throw new BadRequestException('File is empty');
    if (bytes.length > MAX_BYTES)
      throw new BadRequestException(`File too large (${bytes.length} bytes, max ${MAX_BYTES})`);

    // Guard the FK/tenant first so we never orphan bytes in storage for a missing/other-tenant item.
    await this.tenants.runInTenant(tenantId, async (tx) => {
      const wi = await tx.workItem.findFirst({ where: { id: workItemId, deletedAt: null } });
      if (!wi) throw new NotFoundException('Work item not found');
    });

    const storageRef = await this.storage.put(tenantId, bytes, input.contentType);
    return this.tenants.runInTenant(tenantId, async (tx) => {
      const row = await tx.workItemAttachment.create({
        data: {
          tenantId,
          workItemId,
          storageRef,
          fileName: input.fileName.trim(),
          contentType: input.contentType,
          sizeBytes: bytes.length,
          caption: input.caption?.trim() || null,
          uploadedByUserId,
        },
      });
      return toAttachmentView(row);
    });
  }

  async list(tenantId: string, workItemId: string): Promise<AttachmentView[]> {
    return this.tenants.runInTenant(tenantId, async (tx) => {
      const wi = await tx.workItem.findFirst({ where: { id: workItemId, deletedAt: null } });
      if (!wi) throw new NotFoundException('Work item not found');
      const rows = await tx.workItemAttachment.findMany({
        where: { workItemId },
        orderBy: { createdAt: 'desc' },
      });
      return rows.map(toAttachmentView);
    });
  }

  async getContent(
    tenantId: string,
    attachmentId: string,
  ): Promise<{ bytes: Buffer; contentType: string; fileName: string }> {
    const row = await this.tenants.runInTenant(tenantId, (tx) =>
      tx.workItemAttachment.findFirst({ where: { id: attachmentId } }),
    );
    if (!row) throw new NotFoundException('Attachment not found');
    const bytes = await this.storage.get(tenantId, row.storageRef);
    return { bytes, contentType: row.contentType, fileName: row.fileName };
  }

  async remove(tenantId: string, attachmentId: string): Promise<void> {
    const row = await this.tenants.runInTenant(tenantId, (tx) =>
      tx.workItemAttachment.findFirst({ where: { id: attachmentId } }),
    );
    if (!row) throw new NotFoundException('Attachment not found');
    await this.tenants.runInTenant(tenantId, (tx) =>
      tx.workItemAttachment.deleteMany({ where: { id: attachmentId } }),
    );
    await this.storage.remove(tenantId, row.storageRef); // best-effort; row is already gone
  }
}

function toAttachmentView(a: {
  id: string;
  workItemId: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  caption: string | null;
  uploadedByUserId: string;
  createdAt: Date;
}): AttachmentView {
  return {
    id: a.id,
    workItemId: a.workItemId,
    fileName: a.fileName,
    contentType: a.contentType,
    sizeBytes: a.sizeBytes,
    caption: a.caption,
    uploadedByUserId: a.uploadedByUserId,
    createdAt: a.createdAt,
  };
}
