import { Injectable, NotFoundException } from '@nestjs/common';
import { ContactsService, ContactView } from '../contacts/contacts.service';
import { SubjectService, SubjectView } from '../subjects/subject.service';
import { buildTimeline, TimelineEvent } from '../timeline/timeline';
import { AttachmentService, AttachmentView } from '../work-items/attachment.service';
import { NoteService } from '../work-items/note.service';
import { WorkItemService, WorkItemView } from '../work-items/work-item.service';

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

/** States that mean the car has left. Anything else is still live work. */
const CLOSED_STATES = new Set(['collected', 'cancelled', 'closed']);

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
