import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { AiModule } from './ai/ai.module';
import { AssistantModule } from './assistant/assistant.module';
import { AuditModule } from './audit/audit.module';
import { BrandingModule } from './branding/branding.module';
import { DocumentsModule } from './documents/documents.module';
import { InsightsModule } from './insights/insights.module';
import { OnboardingModule } from './onboarding/onboarding.module';
import { WaitlistModule } from './waitlist/waitlist.module';
import { RosterModule } from './roster/roster.module';
import { TimeClockModule } from './time-clock/time-clock.module';
import { InventoryModule } from './inventory/inventory.module';
import { LoyaltyModule } from './loyalty/loyalty.module';
import { ReferralsModule } from './referrals/referrals.module';
import { PosModule } from './pos/pos.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { MarketplaceModule } from './marketplace/marketplace.module';
import { PortalModule } from './portal/portal.module';
import { ReportingModule } from './reporting/reporting.module';
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
import { FleetModule } from './fleet/fleet.module';
import { TicketsModule } from './tickets/tickets.module';
import { EstimateDraftModule } from './estimate-draft/estimate-draft.module';
import { ActivityModule } from './activity/activity.module';
import { YardsModule } from './yards/yards.module';
import { SitesModule } from './sites/sites.module';
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
import { PipelineModule } from './pipeline/pipeline.module';
import { VehicleProfileModule } from './vehicle-profile/vehicle-profile.module';
import { WorkItemModule } from './work-items/work-item.module';
import { TrackingModule } from './tracking/tracking.module';

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
    PipelineModule, // card 52.3 — operations lifecycle pipeline
    VehicleProfileModule, // card 11.1 — pull up a car
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
    DocumentsModule, // documents & e-signature: generate → tokenised public sign page (Phase 3; certified e-sign vendor-gated)
    ReportingModule, // reporting & dashboards: revenue/jobs/turnaround/utilisation overview (Phase 3; read-only)
    PortalModule, // customer portal: passwordless per-customer self-service (jobs/docs/quotes/invoices) (Phase 3)
    BrandingModule, // brand profile: per-tenant business name/logo/colour for customer-facing pages (Phase 3)
    OnboardingModule,
    WaitlistModule,
    RosterModule,
    TimeClockModule,
    InventoryModule,
    LoyaltyModule,
    ReferralsModule,
    PosModule,
    WebhooksModule,
    FleetModule, // fleet & courtesy cars: loan-car movements/returns/bookings/photos (migrated 1:1 from "In N Out")
    TicketsModule, // infringement / police tickets: upload PDF or photo → AI extraction → confirmed store (0052)
    EstimateDraftModule, // saved editable photo-estimate drafts — reopen & edit in place (0053)
    ActivityModule, // cross-car activity directory (employee Car-history feed): movements + tickets + jobs
    TrackingModule, // fleet live-location via CityTag (In N Out migration §9, Phase 2; per-tenant secrets)
    YardsModule, // yards & vehicle logistics: park an incoming car at a yard before a job exists (YRD-1)
    SitesModule, // multi-site: a shop's locations/branches; a job optionally belongs to a site (SITE-1)
    MarketplaceModule, // integration marketplace: catalogue + per-tenant connections (Phase 4; vendor wiring deferred) // public API & webhooks: signed outbound event delivery (Phase 4; partner API keys deferred) // point of sale: walk-in checkout (Phase 4; card payment deferred) // referral engine: codes + trackable referrals/incentives (Phase 4) // loyalty, rewards & gift cards: points + gift-card ledgers (Phase 4) // inventory & stock: levels, usage, reorder signal (Phase 4) // roster & staff management: shifts, availability, time-off (Phase 4) // waitlist & auto-fill: fill cancellations to protect utilisation (Phase 4) // onboarding & data migration: CSV customer import + setup checklist (Phase 3)
  ],
  controllers: [HealthController],
})
export class AppModule {}
