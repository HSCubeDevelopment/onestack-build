/**
 * Storage abstraction for generated documents (card #6.7). The real implementation is Supabase Storage
 * (tenant-scoped buckets/paths); this interface lets the DocumentService be built and tested without it.
 * Every method is keyed by tenantId so an implementation MUST scope access — a tenant can only reach its
 * own documents.
 */
export interface DocumentStorage {
  /** Store content for a tenant; returns an opaque storage ref. */
  put(tenantId: string, content: string, contentType: string): Promise<string>;
  /** Fetch content by ref for a tenant. Throws if the ref doesn't belong to that tenant. */
  get(tenantId: string, ref: string): Promise<string>;
}

export class DocumentStorageError extends Error {}
