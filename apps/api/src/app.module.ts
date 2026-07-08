import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { AiModule } from './ai/ai.module';
import { AssistantModule } from './assistant/assistant.module';
import { AuditModule } from './audit/audit.module';
import { InsightsModule } from './insights/insights.module';
import { ClaimFileModule } from './claim-file/claim-file.module';
import { AuthModule } from './auth/auth.module';
import { BoardModule } from './board/board.module';
import { CampaignsModule } from './campaigns/campaigns.module';
import { CompositionModule } from './composition/composition.module';
import { ContactsModule } from './contacts/contacts.module';
import { CoreModule } from './core/core.module';
import { CustomFieldsModule } from './custom-fields/custom-fields.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { DispatchModule } from './dispatch/dispatch.module';
import { EventingModule } from './eventing/eventing.module';
import { MaterialRequestModule } from './floor-ordering/material-request.module';
import { HealthController } from './health/health.controller';
import { JobsModule } from './jobs/jobs.module';
import { LineItemsModule } from './line-items/line-items.module';
import { ModulesModule } from './modules/modules.module';
import { NotificationsModule } from './notifications/notifications.module';
import { OnlineBookingModule } from './online-booking/online-booking.module';
import { IntakeModule } from './intake/intake.module';
import { InvoicesModule } from './invoices/invoices.module';
import { PriceBookModule } from './price-book/price-book.module';
import { PacksModule } from './packs/packs.module';
import { QuotesModule } from './quotes/quotes.module';
import { ReviewsModule } from './reviews/reviews.module';
import { SchedulingModule } from './scheduling/scheduling.module';
import { SubjectModule } from './subjects/subject.module';
import { SupplierInvoiceModule } from './supplier-invoices/supplier-invoice.module';
import { TagsModule } from './tags/tags.module';
import { TenantModule } from './tenancy/tenant.module';
import { TimelineModule } from './timeline/timeline.module';
import { TerminologyModule } from './terminology/terminology.module';
import { WorkItemModule } from './work-items/work-item.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    EventEmitterModule.forRoot(), // workflow side-effect actions are emitted here
    TenantModule, // global: PrismaService (admin) + TenantService (app_user wrapper)
    AuthModule, // global: JwtAuthGuard + RolesGuard
    JobsModule, // global: BackgroundJobRunner (tenant-context wrapper for jobs)
    EventingModule, // global: EventBus + OutboxService + OutboxRelay (durable eventing backbone)
    AuditModule, // global: AuditService (append-only who-did-what trail)
    NotificationsModule, // global: NotificationService (multi-channel)
    CompositionModule, // global: FeatureFlagService + FeatureGuard + EventBus
    ModulesModule, // global: ModuleCatalog (dependency graph — valid provisioning combos)
    CoreModule, // global: PackRegistry + WorkflowEngine
    CustomFieldsModule, // global: CustomFieldService (per-tenant custom fields, #11)
    PacksModule, // installs the automotive pack into the registry at boot
    TerminologyModule, // global: TerminologyService (pack-driven labels for core concepts)
    ContactsModule,
    SchedulingModule, // toggleable module (OFF by default) — demonstrates feature enforcement
    WorkItemModule,
    SubjectModule,
    LineItemsModule, // shared Quote/Invoice line items (#6.9)
    QuotesModule, // quotes on a job (#30)
    InvoicesModule, // invoices from a job/quote (#40)
    PriceBookModule, // reusable labour/parts catalogue (#32)
    BoardModule, // job board read-model over work items (#22)
    DashboardModule, // thin owner dashboard read-model (#52)
    AiModule, // photo-to-quote AI damage scope (Phase 2 flagship, slice A)
    ClaimFileModule, // claim pack read-model: photos/quotes/invoices per claim (Phase 2)
    MaterialRequestModule, // floor ordering: technician request → manager approve → email (Phase 2)
    SupplierInvoiceModule, // supplier invoice capture → accounting (Phase 2; OCR + sync stubbed)
    TagsModule, // segmentation & tagging: group contacts into segments (Phase 3)
    TimelineModule, // customer timeline read-model: jobs + notes per customer (Phase 3)
    IntakeModule, // digital intake & forms: custom forms → customer record (Phase 3)
    OnlineBookingModule, // public self-service booking (Phase 3; deposits + channels deferred)
    DispatchModule, // dispatch & assignment: jobs by technician + status/ETA (Phase 3)
    CampaignsModule, // marketing campaigns: segmented email/SMS (Phase 3; delivery vendor-gated)
    ReviewsModule, // reviews & reputation: request → public submit → summary (Phase 3)
    AssistantModule, // AI assistant/receptionist: DRAFT replies (Claude when keyed, stub otherwise) (Phase 3)
    InsightsModule, // AI insights & prediction: no-show/churn risk + activity summary (Phase 3; deterministic MVP)
  ],
  controllers: [HealthController],
})
export class AppModule {}
