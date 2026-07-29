import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ContactsService, ContactView } from '../contacts/contacts.service';
import { EstimateDraftService, EstimateDraftView } from '../estimate-draft/estimate-draft.service';
import { FleetService } from '../fleet/fleet.service';
import { InvoiceService } from '../invoices/invoice.service';
import { PrismaService } from '../prisma/prisma.service';
import { QuoteService } from '../quotes/quote.service';
import { SubjectService, SubjectView } from '../subjects/subject.service';
import { TicketsService, TicketView } from '../tickets/tickets.service';
import { buildTimeline, TimelineEvent } from '../timeline/timeline';
import { AttachmentService, AttachmentView } from '../work-items/attachment.service';
import { NoteService } from '../work-items/note.service';
import { WorkItemService, WorkItemView } from '../work-items/work-item.service';
import { phaseCaption, RepairPhase, resolveTargetJob } from './repair-photos';

/**
 * Card 11.1 — "pull up a car". The universal entry point: find a vehicle by its identifier and see it
 * end to end, then act on it without navigating away.
 *
 * The card is written as a FRAMEWORK pattern, not an automotive one: *look up a Subject by its
 * identifier → 360° record → quick-add*. Automotive's identifier happens to be the rego. Nothing here
 * hardcodes "rego" except the list of searchable field names, which comes from the pack.
 *
 * Composition only — this module owns no tables. It reads through other modules' public services
 * (§5: modules talk via services, never each other's tables), which is also why `listForSubject` was
 * added to WorkItemService rather than joining `onestack_work_item_subject` from here.
 *
 * MONEY IS DELIBERATELY ABSENT. The card gates dollar figures behind `finance.view` (card 40.8), and
 * that permission does not exist yet. The safe reading of "gated" when the gate is unbuilt is to show
 * nothing rather than everything — so `amountsCents` is null on every event and no totals are returned.
 * When 40.8 lands, this is where the gate goes; the timeline builder already supports it.
 */

/** The identifiers a vehicle can be found by. From the pack's VehicleFields, not invented here. */
const VEHICLE_IDENTIFIERS = ['rego', 'vin'];

export interface VehicleJobSummary {
  id: string;
  reference: string;
  stateName: string;
  createdAt: Date;
  /** Whether this job is still open — what "current" means on the board. */
  isOpen: boolean;
}

export interface VehicleProfile {
  vehicle: SubjectView;
  /** The customer the car belongs to. Null if the vehicle was created without one. */
  customer: ContactView | null;
  /** The job the car is on right now — the most recent one that isn't finished. Null if none. */
  currentJob: VehicleJobSummary | null;
  jobs: VehicleJobSummary[];
  photos: AttachmentView[];
  timeline: TimelineEvent[];
  /**
   * True when money was withheld rather than absent — so a UI can say "hidden" instead of "$0", which
   * would be a lie. Always true until card 40.8 exists.
   */
  moneyHidden: boolean;
}

/**
 * A single job's full detail for the employee mobile view (opened from Car history) — the same picture
 * the owner's job page shows, so a worker on the floor isn't guessing at half a record.
 *
 * MONEY IS ROLE-GATED, not simply absent: quotes, invoices and the claim's dollar figures are included
 * only when the caller passes the SAME finance gate the owner surface uses (card 40.8 — an OWNER always,
 * a STAFF member only if the owner granted `canViewFinance`). When withheld, the money fields are null
 * and `moneyHidden` is true so the UI can say "hidden" rather than imply zero.
 */
export interface EmployeeJobDetail {
  job: {
    id: string;
    reference: string;
    stateName: string;
    assignees: string[];
    siteId: string | null;
    description: string;
    fields: Record<string, unknown>;
    createdAt: string;
    updatedAt: string;
  };
  /** The primary vehicle (kept for existing callers) plus every vehicle on the job. */
  vehicle: { id: string; label: string; rego: string; fields: Record<string, unknown> } | null;
  vehicles: { id: string; label: string; rego: string; fields: Record<string, unknown> }[];
  customer: { id: string; displayName: string; phone: string | null; email: string | null } | null;
  /** The insurance claim as recorded on the job. Dollar figures stripped unless money is visible. */
  claim: Record<string, unknown> | null;
  notes: { body: string; authorUserId: string; createdAt: string }[];
  photos: AttachmentView[];
  estimate: EstimateDraftView | null;
  tickets: TicketView[];
  /** Null when withheld by the finance gate (never an empty list, which would read as "none"). */
  quotes: { id: string; reference: string; status: string; totalCents: number }[] | null;
  invoices:
    | {
        id: string;
        reference: string;
        status: string;
        totalCents: number;
        paidCents: number;
        balanceCents: number;
      }[]
    | null;
  moneyHidden: boolean;
}

/** Claim keys that carry dollar figures — removed when the caller can't see money. */
const CLAIM_MONEY_KEYS = ['authorisedAmountCents', 'excessCents'];

/** States that mean the car has left. Anything else is still live work. */
const CLOSED_STATES = new Set(['collected', 'cancelled', 'closed']);

/** The rego a vehicle subject is found by — its `rego` field, or the label as a fallback. */
function regoOf(v: SubjectView): string {
  return (typeof v.fields.rego === 'string' && v.fields.rego) || v.label;
}

const isOpen = (stateName: string): boolean =>
  !CLOSED_STATES.has(stateName.toLowerCase().replace(/[\s_-]/g, ''));

@Injectable()
export class VehicleProfileService {
  constructor(
    private readonly subjects: SubjectService,
    private readonly contacts: ContactsService,
    private readonly workItems: WorkItemService,
    private readonly notes: NoteService,
    private readonly attachments: AttachmentService,
    private readonly fleet: FleetService,
    private readonly estimateDrafts: EstimateDraftService,
    private readonly tickets: TicketsService,
    private readonly quotes: QuoteService,
    private readonly invoices: InvoiceService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Find vehicles by rego or VIN. Forgiving of case and spaces, because the person searching is reading
   * a number plate off a car in a workshop, not copying a string — "1xy 4kp" must find "1XY4KP".
   */
  async search(tenantId: string, query: string): Promise<SubjectView[]> {
    const cleaned = query.replace(/\s+/g, '').trim();
    if (!cleaned) return [];
    return this.subjects.searchAcrossFields(tenantId, 'vehicle', VEHICLE_IDENTIFIERS, cleaned);
  }

  /** The full 360 for one vehicle. 404s for a vehicle in another tenant (RLS + an explicit check). */
  async profile(tenantId: string, vehicleId: string): Promise<VehicleProfile> {
    const vehicle = await this.subjects.get(tenantId, vehicleId);
    if (!vehicle || vehicle.type !== 'vehicle') throw new NotFoundException('Vehicle not found');

    const workItems = await this.workItems.listForSubject(tenantId, vehicleId);
    const jobs = workItems.map(toJobSummary);

    // The customer comes from the vehicle's own contact link, not from a job — a car belongs to someone
    // even before it has any work booked on it.
    const customer = vehicle.contactId
      ? await this.contacts.get(tenantId, vehicle.contactId).catch(() => null)
      : null;

    // Photos and notes across every job this car has been through — the point of a 360 is that history
    // follows the CAR, not the job it happened to be on.
    const perJob = await Promise.all(
      workItems.map(async (job) => ({
        job,
        notes: await this.notes.list(tenantId, job.id),
        photos: await this.attachments.list(tenantId, job.id),
      })),
    );

    const timeline = buildTimeline(
      perJob.map(({ job }) => ({
        id: job.id,
        reference: job.reference,
        stateName: job.stateName,
        createdAt: job.createdAt,
        // Zeroed, then stripped below. See the class doc: withheld, not absent.
        quoteCount: 0,
        quoteTotalCents: 0,
        invoiceCount: 0,
        invoiceTotalCents: 0,
        invoicePaidCents: 0,
      })),
      perJob.flatMap(({ job, notes }) =>
        notes.map((n) => ({
          jobId: job.id,
          jobReference: job.reference,
          body: n.body,
          authorUserId: n.authorUserId,
          createdAt: n.createdAt,
        })),
      ),
    ).map((event) => ({ ...event, amountsCents: null }));

    return {
      vehicle,
      customer,
      currentJob: jobs.find((j) => j.isOpen) ?? null,
      jobs,
      photos: perJob.flatMap(({ photos }) => photos),
      timeline,
      moneyHidden: true,
    };
  }

  /**
   * Add a repair-phase photo (Before/During/After) to a car. Deliberately staff-accessible via this
   * "pull up a car" surface: whoever is photographing the car on the floor isn't necessarily its assigned
   * technician, and this module already exposes every car's photos to any staff member. The phase is
   * stored in the attachment caption (there's no typed phase column). Attaches to the car's current job
   * (or an explicitly chosen one). Tenant-scoped throughout by the underlying services.
   */
  async addPhoto(
    tenantId: string,
    userId: string,
    vehicleId: string,
    input: { phase: RepairPhase; dataBase64: string; contentType?: string; jobId?: string },
  ): Promise<{ attachment: AttachmentView; jobId: string; jobReference: string }> {
    const vehicle = await this.subjects.get(tenantId, vehicleId);
    if (!vehicle || vehicle.type !== 'vehicle') throw new NotFoundException('Vehicle not found');

    const jobs = (await this.workItems.listForSubject(tenantId, vehicleId)).map(toJobSummary);
    const resolved = resolveTargetJob(jobs, input.jobId);
    if ('error' in resolved) {
      throw new BadRequestException(
        resolved.error === 'no_jobs'
          ? 'This car has no job to attach photos to.'
          : 'That job is not on this car.',
      );
    }

    const attachment = await this.attachments.add(tenantId, resolved.job.id, userId, {
      fileName: `${input.phase}.jpg`,
      contentType: input.contentType || 'image/jpeg',
      dataBase64: input.dataBase64,
      caption: phaseCaption(input.phase),
    });
    return { attachment, jobId: resolved.job.id, jobReference: resolved.job.reference };
  }

  /**
   * Start a DRAFT car from just a registration, for when the plate isn't in the system yet — "a damaged
   * car arriving" that needs an estimate before it's fully booked in. Creates a `vehicle` subject (reusing
   * one if the exact rego already exists) and ensures it has an open job to hang the estimate/photos on.
   * Staff-accessible, mirroring the tow-in flow which already lets staff create a car + job on the floor.
   */
  async createDraft(
    tenantId: string,
    userId: string,
    input: { rego: string; make?: string; model?: string },
  ): Promise<{
    vehicleId: string;
    rego: string;
    label: string;
    jobId: string;
    jobReference: string;
  }> {
    const rego = input.rego.replace(/\s+/g, '').toUpperCase().trim();
    if (!rego) throw new BadRequestException('Enter a registration.');
    let make = input.make?.trim();
    let model = input.model?.trim();

    // Reuse an existing car with this EXACT rego rather than creating a duplicate.
    const existing = (
      await this.subjects.searchAcrossFields(tenantId, 'vehicle', ['rego'], rego)
    ).find((v) => String((v.fields as Record<string, unknown>)?.rego ?? '').toUpperCase() === rego);

    // Utilise the real car database: if this rego isn't a working car yet and we weren't told the
    // make/model, pull them from the FLEET vehicle record (the ~thousands of imported cars) by rego.
    if (!existing && !make && !model) {
      const fleetCar = await this.fleet.getVehicleByRego(tenantId, rego);
      if (fleetCar) {
        make = fleetCar.make;
        model = fleetCar.model;
      }
    }

    // A draft car has no customer yet, but the vehicle link and the job both want one — create a
    // placeholder contact (the shop fills in real details later), reused across the car and its job.
    let contactId = existing?.contactId ?? null;
    const ensureContact = async (): Promise<string> => {
      if (!contactId) {
        const contact = await this.contacts.create(tenantId, {
          displayName: `Draft customer (${rego})`,
          phone: '',
        });
        contactId = contact.id;
      }
      return contactId;
    };

    const displayName = [make, model].filter(Boolean).join(' ');
    let vehicle: SubjectView;
    if (existing) {
      vehicle = existing;
    } else {
      const cid = await ensureContact();
      vehicle = await this.subjects.create(tenantId, {
        type: 'vehicle',
        label: displayName ? `${displayName} (${rego})` : rego,
        // The automotive vehicle schema requires make/model/year. For a draft the plate is all we have,
        // so fill placeholders the owner corrects later (make/model "Unknown", year = this year).
        fields: {
          rego,
          make: make || 'Unknown',
          model: model || 'Unknown',
          year: new Date().getFullYear(),
        },
        contactId: cid,
      });
    }

    // Ensure there's an open job to attach work to; create a draft one if the car has none open.
    const jobs = (await this.workItems.listForSubject(tenantId, vehicle.id)).map(toJobSummary);
    const open = jobs.find((j) => j.isOpen);
    let jobId: string;
    let jobReference: string;
    if (open) {
      jobId = open.id;
      jobReference = open.reference;
    } else {
      const created = await this.workItems.create(tenantId, {
        type: 'job',
        fields: {
          customerId: await ensureContact(),
          description: 'Draft job — created from an instant estimate.',
        },
        subjectIds: [vehicle.id],
        assignees: [userId],
      });
      jobId = created.id;
      jobReference = created.reference;
    }

    // Display label — hide the "Unknown" placeholders so a plain draft just shows its rego.
    const f = vehicle.fields as Record<string, unknown>;
    const realMake = f?.make && f.make !== 'Unknown' ? String(f.make) : '';
    const realModel = f?.model && f.model !== 'Unknown' ? String(f.model) : '';
    const label = [realMake, realModel].filter(Boolean).join(' ');
    return { vehicleId: vehicle.id, rego, label, jobId, jobReference };
  }

  /**
   * Save an AI photo-estimate against a car (its current job): the summary as a job note, and the photos
   * as job attachments captioned "Estimate photo". Staff-accessible via this surface. It is a DRAFT the
   * owner reviews — this never creates a money quote (that stays owner-gated).
   */
  async saveEstimate(
    tenantId: string,
    userId: string,
    vehicleId: string,
    input: {
      summary: string;
      photos: { dataBase64: string; contentType?: string }[];
      jobId?: string;
      /** The full structured estimate — persisted so it can be REOPENED and edited in place. */
      data?: unknown;
      source?: string;
      model?: string;
    },
  ): Promise<{ jobId: string; jobReference: string; photoCount: number; draftId: string }> {
    const vehicle = await this.subjects.get(tenantId, vehicleId);
    if (!vehicle || vehicle.type !== 'vehicle') throw new NotFoundException('Vehicle not found');

    const jobs = (await this.workItems.listForSubject(tenantId, vehicleId)).map(toJobSummary);
    const resolved = resolveTargetJob(jobs, input.jobId);
    if ('error' in resolved) {
      throw new BadRequestException(
        resolved.error === 'no_jobs'
          ? 'This car has no job to save the estimate to.'
          : 'That job is not on this car.',
      );
    }

    // Is this the first save for this job, or an in-place edit of an existing draft?
    const existing = await this.estimateDrafts.getForJob(tenantId, resolved.job.id);

    for (const [i, p] of input.photos.entries()) {
      await this.attachments.add(tenantId, resolved.job.id, userId, {
        fileName: `estimate-${i + 1}.jpg`,
        contentType: p.contentType || 'image/jpeg',
        dataBase64: p.dataBase64,
        caption: 'Estimate photo',
      });
    }
    // Only drop a timeline note the FIRST time — an edit updates the draft in place, so re-noting each
    // edit would just clutter the car's history.
    if (!existing) await this.notes.add(tenantId, resolved.job.id, userId, input.summary);

    const draft = await this.estimateDrafts.upsertForJob(tenantId, userId, {
      workItemId: resolved.job.id,
      rego: regoOf(vehicle),
      summary: input.summary,
      data: input.data,
      photoCount: (existing?.photoCount ?? 0) + input.photos.length,
      source: input.source ?? 'ai',
      model: input.model ?? '',
    });

    return {
      jobId: resolved.job.id,
      jobReference: resolved.job.reference,
      photoCount: input.photos.length,
      draftId: draft.id,
    };
  }

  /** The car's saved estimate draft (its current/target job's), or null if it has none. @AllowStaff read. */
  async getEstimateDraft(
    tenantId: string,
    vehicleId: string,
    jobId?: string,
  ): Promise<EstimateDraftView | null> {
    const vehicle = await this.subjects.get(tenantId, vehicleId);
    if (!vehicle || vehicle.type !== 'vehicle') throw new NotFoundException('Vehicle not found');
    const jobs = (await this.workItems.listForSubject(tenantId, vehicleId)).map(toJobSummary);
    const resolved = resolveTargetJob(jobs, jobId);
    if ('error' in resolved) return null; // no job yet → no draft
    return this.estimateDrafts.getForJob(tenantId, resolved.job.id);
  }

  /**
   * A single job's full detail for the on-the-floor employee view (opened from Car history). Composes the
   * job, its car, notes/timeline, photos, saved estimate draft and the car's tickets — everything the job
   * "entails" — through the same public services, no tables. MONEY stays hidden (like the car 360), so no
   * quote/invoice figures leak to a role without finance.view.
   */
  async jobDetail(
    tenantId: string,
    jobId: string,
    viewer: { userId: string; role: string },
  ): Promise<EmployeeJobDetail> {
    const job = await this.workItems.get(tenantId, jobId); // throws NotFound if missing / other tenant
    const subjects = await this.subjects.listForWorkItem(tenantId, jobId);
    const vehicles = subjects
      .filter((s) => s.type === 'vehicle')
      .map((v) => ({ id: v.id, label: v.label, rego: regoOf(v), fields: v.fields }));
    const primary = vehicles[0] ?? null;
    const rego = primary?.rego ?? '';

    // The SAME gate the owner money surface uses (40.8) — owner always, staff only if granted.
    const canViewMoney = await this.canViewFinance(tenantId, viewer);

    const customerId = job.fields.customerId;
    const [notes, photos, estimate, tickets, customer, quotes, invoices] = await Promise.all([
      this.notes.list(tenantId, jobId),
      this.attachments.list(tenantId, jobId),
      this.estimateDrafts.getForJob(tenantId, jobId),
      rego ? this.tickets.list(tenantId, { rego }) : Promise.resolve([]),
      typeof customerId === 'string'
        ? this.contacts.get(tenantId, customerId).catch(() => null)
        : Promise.resolve(null),
      canViewMoney
        ? this.quotes.listForJob(tenantId, jobId).catch(() => [])
        : Promise.resolve(null),
      canViewMoney
        ? this.invoices.listForJob(tenantId, jobId).catch(() => [])
        : Promise.resolve(null),
    ]);

    // The claim as recorded, with dollar figures stripped when money is withheld.
    let claim: Record<string, unknown> | null = null;
    const rawClaim = job.fields.claim;
    if (rawClaim && typeof rawClaim === 'object') {
      claim = { ...(rawClaim as Record<string, unknown>) };
      if (!canViewMoney) for (const k of CLAIM_MONEY_KEYS) delete claim[k];
    }

    return {
      job: {
        id: job.id,
        reference: job.reference,
        stateName: job.stateName,
        assignees: job.assignees,
        siteId: job.siteId,
        description: typeof job.fields.description === 'string' ? job.fields.description : '',
        fields: job.fields,
        createdAt: job.createdAt.toISOString(),
        updatedAt: job.updatedAt.toISOString(),
      },
      vehicle: primary,
      vehicles,
      customer: customer
        ? {
            id: customer.id,
            displayName: customer.displayName,
            phone: customer.phone,
            email: customer.email,
          }
        : null,
      claim,
      notes: notes.map((n) => ({
        body: n.body,
        authorUserId: n.authorUserId,
        createdAt: n.createdAt.toISOString(),
      })),
      photos,
      estimate,
      tickets,
      quotes:
        quotes?.map((q) => ({
          id: q.id,
          reference: q.reference,
          status: q.status,
          totalCents: q.totalCents,
        })) ?? null,
      invoices:
        invoices?.map((i) => ({
          id: i.id,
          reference: i.reference,
          status: i.status,
          totalCents: i.totalCents,
          paidCents: i.paidCents,
          balanceCents: i.balanceCents,
        })) ?? null,
      moneyHidden: !canViewMoney,
    };
  }

  /**
   * Card 40.8's finance rule, read per-request from the membership row (not the JWT) so a revoked grant
   * takes effect immediately — deliberately identical to FinanceGuard rather than a second, drifting copy.
   */
  private async canViewFinance(
    tenantId: string,
    viewer: { userId: string; role: string },
  ): Promise<boolean> {
    if (viewer.role === 'OWNER') return true;
    const membership = await this.prisma.membership.findFirst({
      where: { tenantId, userId: viewer.userId },
      select: { canViewFinance: true },
    });
    return membership?.canViewFinance ?? false;
  }

  /**
   * Stream a car photo's bytes, but only if the attachment really belongs to one of THIS car's jobs — so
   * a staff member can't pull arbitrary attachment bytes by guessing an id through this open surface. All
   * reads are tenant-scoped, so this is an intra-tenant ownership check, not a tenant boundary.
   */
  async photoContent(
    tenantId: string,
    vehicleId: string,
    attachmentId: string,
  ): Promise<{ bytes: Buffer; contentType: string; fileName: string }> {
    const vehicle = await this.subjects.get(tenantId, vehicleId);
    if (!vehicle || vehicle.type !== 'vehicle') throw new NotFoundException('Vehicle not found');

    const jobs = await this.workItems.listForSubject(tenantId, vehicleId);
    const perJob = await Promise.all(jobs.map((j) => this.attachments.list(tenantId, j.id)));
    const belongs = perJob.some((atts) => atts.some((a) => a.id === attachmentId));
    if (!belongs) throw new NotFoundException('Photo not found');

    return this.attachments.getContent(tenantId, attachmentId);
  }
}

function toJobSummary(w: WorkItemView): VehicleJobSummary {
  return {
    id: w.id,
    reference: w.reference,
    stateName: w.stateName,
    createdAt: w.createdAt,
    isOpen: isOpen(w.stateName),
  };
}
