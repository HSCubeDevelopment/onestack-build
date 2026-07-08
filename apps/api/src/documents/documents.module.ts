import { Module } from '@nestjs/common';
import { DocumentRecordService } from './document-record.service';
import { DOCUMENT_STORAGE, DocumentStorage } from './document-storage';
import { DocumentsController } from './documents.controller';
import {
  ESIGNATURE_PROVIDER,
  ESignatureProvider,
  NoopESignatureProvider,
} from './esignature-provider';
import { InMemoryDocumentStorage } from './in-memory-storage';
import { PublicSignatureController } from './public-signature.controller';
import { SignatureService } from './signature.service';
import { SupabaseDocumentStorage } from './supabase-storage';

/**
 * Documents & e-signature (card #6.7 + card #143). Renders pack templates to tenant-scoped stored documents
 * linked to a source entity, lists/downloads them, and adds e-signature: an owner requests a signature and
 * shares an unguessable public sign link (secure document exchange) where the signer reviews the document
 * and signs by typed-name acknowledgement. Storage is Supabase when configured, in-memory otherwise. A
 * legally-binding CERTIFIED e-signature is a deferred vendor (ESignatureProvider → NoopESignatureProvider).
 * Exports DocumentRecordService so other modules (e.g. the claim file) can generate + gather documents.
 */
@Module({
  controllers: [DocumentsController, PublicSignatureController],
  providers: [
    DocumentRecordService,
    SignatureService,
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
    {
      provide: ESIGNATURE_PROVIDER,
      useFactory: (): ESignatureProvider => new NoopESignatureProvider(),
    },
  ],
  exports: [DocumentRecordService],
})
export class DocumentsModule {}
