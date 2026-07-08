import { Module } from '@nestjs/common';
import { ContactsModule } from '../contacts/contacts.module';
import { DocumentsModule } from '../documents/documents.module';
import { InvoicesModule } from '../invoices/invoices.module';
import { OnlineBookingModule } from '../online-booking/online-booking.module';
import { QuotesModule } from '../quotes/quotes.module';
import { WorkItemModule } from '../work-items/work-item.module';
import { PortalController } from './portal.controller';
import { PortalService } from './portal.service';
import { PublicPortalController } from './public-portal.controller';

/**
 * Customer / client portal (Phase 3, card #150). A passwordless, per-customer self-service page aggregating
 * the customer's jobs, documents (+ any pending e-sign link), quotes (approve/decline) and invoices
 * (read-only — online payments deferred), plus the shop's branded booking link. GENERIC core. Composes the
 * owning services (contacts, work items, quotes, invoices, documents/signatures, online booking) and owns
 * only its token table. PrismaService (BYPASSRLS token resolve) + TenantService come from the global
 * TenantModule. Everything is filtered to the token's own customer.
 */
@Module({
  imports: [
    ContactsModule,
    WorkItemModule,
    QuotesModule,
    InvoicesModule,
    DocumentsModule,
    OnlineBookingModule,
  ],
  controllers: [PortalController, PublicPortalController],
  providers: [PortalService],
})
export class PortalModule {}
