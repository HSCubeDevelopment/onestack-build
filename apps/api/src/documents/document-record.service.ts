import { Injectable, NotFoundException } from '@nestjs/common';
import { TenantService } from '../tenancy/tenant.service';
import { DocumentStorage } from './document-storage';
import { renderDocument } from './template-renderer';

export interface GenerateDocInput {
  type: string;
  parentType: string;
  parentId: string;
  templateRef: string;
  body: string;
  data: Record<string, unknown>;
}

export interface DocumentRecordView {
  id: string;
  type: string;
  parentType: string;
  parentId: string;
  templateRef: string;
  templateVersion: string;
  storageRef: string;
}

/**
 * Generates a document (card #6.7): renders the template, stores the bytes in tenant-scoped storage, and
 * persists a metadata row linking it to its source entity. Retrieval goes through the DB row (RLS) so a
 * tenant can only reach its own documents; the storage adapter is a second scope check.
 */
@Injectable()
export class DocumentRecordService {
  constructor(
    private readonly tenants: TenantService,
    private readonly storage: DocumentStorage,
  ) {}

  async generate(tenantId: string, input: GenerateDocInput): Promise<DocumentRecordView> {
    const rendered = renderDocument(input.templateRef, input.body, input.data);
    const storageRef = await this.storage.put(tenantId, rendered.content, 'text/plain');
    const row = await this.tenants.runInTenant(tenantId, (tx) =>
      tx.document.create({
        data: {
          tenantId,
          type: input.type,
          parentType: input.parentType,
          parentId: input.parentId,
          templateRef: rendered.templateRef,
          templateVersion: rendered.templateVersion,
          storageRef,
        },
      }),
    );
    return toView(row);
  }

  /** Download a document's content — only for the owning tenant (RLS on the row + storage prefix check). */
  async download(tenantId: string, id: string): Promise<string> {
    const doc = await this.tenants.runInTenant(tenantId, (tx) =>
      tx.document.findFirst({ where: { id } }),
    );
    if (!doc) throw new NotFoundException('Document not found');
    return this.storage.get(tenantId, doc.storageRef);
  }

  async list(
    tenantId: string,
    parentType: string,
    parentId: string,
  ): Promise<DocumentRecordView[]> {
    const rows = await this.tenants.runInTenant(tenantId, (tx) =>
      tx.document.findMany({ where: { parentType, parentId }, orderBy: { generatedAt: 'desc' } }),
    );
    return rows.map(toView);
  }
}

function toView(r: DocumentRecordView): DocumentRecordView {
  return {
    id: r.id,
    type: r.type,
    parentType: r.parentType,
    parentId: r.parentId,
    templateRef: r.templateRef,
    templateVersion: r.templateVersion,
    storageRef: r.storageRef,
  };
}
