import { Module } from '@nestjs/common';
import { DocumentRecordService } from './document-record.service';
import { DOCUMENT_STORAGE, DocumentStorage } from './document-storage';
import { InMemoryDocumentStorage } from './in-memory-storage';
import { SupabaseDocumentStorage } from './supabase-storage';

/**
 * Documents (card #6.7). Renders pack templates to tenant-scoped stored documents linked to a source
 * entity, and lists/downloads them. Storage is Supabase when configured, in-memory otherwise (local dev,
 * tests). Exports DocumentRecordService so other modules (e.g. the claim file) can generate and gather
 * a job's generated documents.
 */
@Module({
  providers: [
    DocumentRecordService,
    {
      provide: DOCUMENT_STORAGE,
      useFactory: (): DocumentStorage => {
        try {
          return SupabaseDocumentStorage.fromEnv();
        } catch {
          return new InMemoryDocumentStorage();
        }
      },
    },
  ],
  exports: [DocumentRecordService],
})
export class DocumentsModule {}
