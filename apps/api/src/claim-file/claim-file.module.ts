import { Module } from '@nestjs/common';
import { ContactsModule } from '../contacts/contacts.module';
import { DocumentsModule } from '../documents/documents.module';
import { InvoicesModule } from '../invoices/invoices.module';
import { QuotesModule } from '../quotes/quotes.module';
import { SubjectModule } from '../subjects/subject.module';
import { WorkItemModule } from '../work-items/work-item.module';
import { ClaimFileController } from './claim-file.controller';
import { ClaimFileService } from './claim-file.service';
import { CLAIM_PACK_SHARER, ClaimPackSharer, NoopClaimPackSharer } from './claim-pack-sharer';

/**
 * Claim file (Phase 2). A read-model that groups a claim's artefacts (job + claim paperwork, customer,
 * vehicles, photos, quotes, invoices) into one exportable/shareable pack. Reads every domain through its
 * public service — WorkItemModule (job + photos), ContactsModule, SubjectModule, QuotesModule,
 * InvoicesModule — never their tables. Sharing externally is a vendor boundary (no-op by default).
 */
@Module({
  imports: [
    WorkItemModule,
    ContactsModule,
    SubjectModule,
    QuotesModule,
    InvoicesModule,
    DocumentsModule,
  ],
  controllers: [ClaimFileController],
  providers: [
    ClaimFileService,
    {
      // Share-a-claim-pack vendor boundary. No-op until a link/email provider is chosen.
      provide: CLAIM_PACK_SHARER,
      useFactory: (): ClaimPackSharer => new NoopClaimPackSharer(),
    },
  ],
})
export class ClaimFileModule {}
