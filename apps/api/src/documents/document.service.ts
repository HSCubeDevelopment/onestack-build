import { DocumentStorage } from './document-storage';
import { renderDocument } from './template-renderer';

export interface GenerateInput {
  templateRef: string;
  body: string; // the pack-supplied template body
  data: Record<string, unknown>;
  contentType?: string;
}

export interface GeneratedDocument {
  templateRef: string;
  templateVersion: string;
  ref: string; // storage ref (tenant-scoped)
}

/**
 * Document service (card #6.7): render a pack template with data and store the result tenant-scoped.
 * Generation is deterministic + versioned (the template version that produced the doc is recorded).
 * The storage adapter is injected — in-memory for tests, Supabase Storage in production — so this
 * orchestration is fully testable without the DB. (The Document DB row that links a stored doc to its
 * source entity is added when the DB is available.)
 */
export class DocumentService {
  constructor(private readonly storage: DocumentStorage) {}

  async generate(tenantId: string, input: GenerateInput): Promise<GeneratedDocument> {
    const rendered = renderDocument(input.templateRef, input.body, input.data);
    const ref = await this.storage.put(
      tenantId,
      rendered.content,
      input.contentType ?? 'text/plain',
    );
    return { templateRef: rendered.templateRef, templateVersion: rendered.templateVersion, ref };
  }

  /** Fetch a previously generated document — only for the owning tenant (storage enforces it). */
  async fetch(tenantId: string, ref: string): Promise<string> {
    return this.storage.get(tenantId, ref);
  }
}
