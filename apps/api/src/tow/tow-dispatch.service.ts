import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { SupabaseAuthService } from '../auth/supabase-auth.service';
import { ContactsService } from '../contacts/contacts.service';
import { AttachmentService, AttachmentView } from '../work-items/attachment.service';
import { NoteService } from '../work-items/note.service';
import { SubjectService } from '../subjects/subject.service';
import { TenantService } from '../tenancy/tenant.service';
import { WorkItemService } from '../work-items/work-item.service';
import { CreateTowJobDto } from './dto/tow-job.dto';

/** A tow as the SHOP sees it: the driver-facing view plus who is doing it. */
export interface TowActivityItem extends TowJobView {
  /** The driver's name, resolved from their sign-in identity. Never a bare uuid. */
  driverName: string | null;
}

/** What the office needs to answer "is the tow driver out on a job right now?". */
export interface TowActivity {
  /** Booked but not finished, most recently updated first. */
  active: TowActivityItem[];
  /** Finished, most recent first. Capped — this is a recent-history panel, not an archive. */
  past: TowActivityItem[];
}

/** One photo the driver took, for the office to look at. Bytes come from the content route. */
export interface TowPhoto {
  id: string;
  caption: string | null;
  fileName: string;
  contentType: string;
  /** 'pickup' | 'dropoff' | 'other' — derived from the caption the app writes at capture time. */
  leg: 'pickup' | 'dropoff' | 'other';
  uploadedAt: Date;
}

/** What a driver needs on the road, in one shape. */
export interface TowJobView {
  jobId: string;
  reference: string;
  status: string;
  /** Where to collect it. A typed address, not a device fix. */
  pickupAddress: string | null;
  pickupNotes: string | null;
  dropOff: { yardId: string; name: string } | null;
  vehicle: { rego: string; make: string; model: string; year: number | null } | null;
  customer: { name: string; phone: string | null } | null;
  photos: { pickup: number; dropOff: number };
  assignedTo: string | null;
  updatedAt: Date;
}

/**
 * Tow DISPATCH — the office sends a driver to collect a car.
 *
 * This is the opposite direction to the older `TowService`, which records a pickup a driver has ALREADY
 * done and self-assigns the job to them. Here someone in the office books the work and a named driver
 * receives it.
 *
 * WHY THIS IS NOT `POST /work-items/:id/assign`. That route is OWNER-only on purpose — whoever can call
 * it decides who a job belongs to, and every non-owner's read scope hangs off that, so a worker able to
 * call it could assign themselves any job in the shop. Staff need to book tows, so this endpoint does
 * one narrow thing instead: it creates a job and assigns it to a driver who holds the TOW role. It
 * cannot be used to grab an existing job, and it cannot assign to anyone else.
 */
@Injectable()
export class TowDispatchService {
  constructor(
    private readonly tenants: TenantService,
    private readonly workItems: WorkItemService,
    private readonly subjects: SubjectService,
    private readonly contacts: ContactsService,
    private readonly notes: NoteService,
    private readonly supabase: SupabaseAuthService,
    private readonly attachments: AttachmentService,
  ) {}

  /**
   * Every tow in the shop, split into what is happening now and what has been done.
   *
   * ⚠️ VISIBILITY — this is deliberately WIDER than the usual staff scope, and the widening is the
   * point: the office needs to answer "is the driver out on a job, and where is he?" without being
   * assigned to that job. A job's assignees still govern everything else; the only thing opened here
   * is TOW work, identified by its dispatch row carrying a pickup address. A staff member still cannot
   * read a repair job they are not on. Flagged for review — it is a permissions change, not a feature.
   */
  async activity(tenantId: string, pastLimit = 25): Promise<TowActivity> {
    const rows = await this.tenants.runInTenant(tenantId, (tx) =>
      tx.dispatch.findMany({
        where: { pickupAddress: { not: null } },
        orderBy: { updatedAt: 'desc' },
        select: { workItemId: true, status: true },
      }),
    );

    const active: TowActivityItem[] = [];
    const past: TowActivityItem[] = [];
    for (const r of rows) {
      const done = r.status === 'completed';
      // Stop assembling finished jobs once the panel is full; active ones are always all shown.
      if (done && past.length >= pastLimit) continue;
      // A job deleted out from under a stale dispatch row must not take the whole screen down.
      const v = await this.view(tenantId, r.workItemId).catch(() => null);
      if (!v) continue;
      (done ? past : active).push({ ...v, driverName: null });
    }

    // One identity lookup for the whole board rather than one per job.
    const ids = [...new Set([...active, ...past].map((j) => j.assignedTo).filter(Boolean))];
    const profiles = await this.supabase
      .profilesByUserId(ids as string[])
      .catch(() => new Map<string, { email: string | null; name: string | null }>());
    const name = (id: string | null): string | null => {
      if (!id) return null;
      const p = profiles.get(id);
      return p?.name || p?.email || `Driver ${id.slice(0, 8)}`;
    };
    for (const j of active) j.driverName = name(j.assignedTo);
    for (const j of past) j.driverName = name(j.assignedTo);

    return { active, past };
  }

  /**
   * The photos on one tow job.
   *
   * 404s on anything that is not a tow — see `assertTowJob`. That is what keeps this from being a way
   * to read any job's photos by guessing an id.
   */
  async photos(tenantId: string, jobId: string): Promise<TowPhoto[]> {
    await this.assertTowJob(tenantId, jobId);
    const rows = await this.attachments.list(tenantId, jobId);
    return rows.map(toTowPhoto);
  }

  /** Bytes for one photo, proven to belong to that tow job before anything is read from storage. */
  async photoContent(
    tenantId: string,
    jobId: string,
    photoId: string,
  ): Promise<{ bytes: Buffer; contentType: string; fileName: string }> {
    await this.assertTowJob(tenantId, jobId);
    // getContent resolves by attachment id ALONE. Without this check, a guessed id would pull bytes
    // from any job in the tenant through a route that only ever meant to serve tow photos.
    const owned = (await this.attachments.list(tenantId, jobId)).some((a) => a.id === photoId);
    if (!owned) throw new NotFoundException('Photo not found');
    return this.attachments.getContent(tenantId, photoId);
  }

  /**
   * Throw unless this job really is a tow.
   *
   * A tow is a job whose dispatch sidecar carries a pickup address — the same marker `forDriver` uses.
   * Every shop-wide read above narrows to that, so opening tow work to the office opens nothing else.
   */
  private async assertTowJob(tenantId: string, jobId: string): Promise<void> {
    const d = await this.tenants.runInTenant(tenantId, (tx) =>
      tx.dispatch.findFirst({ where: { workItemId: jobId, pickupAddress: { not: null } } }),
    );
    if (!d) throw new NotFoundException('Tow job not found');
  }

  /**
   * Members of this shop who can be sent on a tow, by NAME.
   *
   * The name comes from the Supabase identity, the same source the PIN name-picker uses. Without it
   * the booking form offered "0d15ea5e" as a driver, which nobody in the office can match to a person.
   * A driver with no resolvable profile still appears — they are a real driver and must be bookable —
   * but is labelled so, rather than silently dropped.
   */
  async drivers(tenantId: string): Promise<{ userId: string; name: string; role: string }[]> {
    const rows = await this.tenants.runInTenant(tenantId, (tx) =>
      tx.membership.findMany({
        where: { role: 'TOW' },
        select: { userId: true, role: true },
        orderBy: { createdAt: 'asc' },
      }),
    );
    const profiles = await this.supabase
      .profilesByUserId(rows.map((r) => r.userId))
      .catch(() => new Map<string, { email: string | null; name: string | null }>());
    return rows.map((r) => {
      const p = profiles.get(r.userId);
      return {
        userId: r.userId,
        name: p?.name || p?.email || `Driver ${r.userId.slice(0, 8)}`,
        role: String(r.role),
      };
    });
  }

  async create(
    tenantId: string,
    bookedByUserId: string,
    dto: CreateTowJobDto,
  ): Promise<TowJobView> {
    // The driver must actually be a tow driver in THIS shop. Without this an arbitrary uuid could be
    // written into assignees, which is the column every non-owner's visibility is derived from.
    const driver = await this.tenants.runInTenant(tenantId, (tx) =>
      tx.membership.findFirst({ where: { userId: dto.driverUserId, role: 'TOW' } }),
    );
    if (!driver) throw new BadRequestException('That person is not a tow driver at this workshop');

    const yard = await this.tenants.runInTenant(tenantId, (tx) =>
      tx.yard.findFirst({ where: { id: dto.destinationYardId, deletedAt: null } }),
    );
    if (!yard) throw new NotFoundException('Destination yard not found');

    // Reuse the customer if we already know them. The older tow flow creates a fresh Contact on every
    // pickup with no lookup, which is how the customer list filled up with duplicates.
    const contact = await this.findOrCreateContact(tenantId, dto.customerName, dto.customerPhone);

    const vehicle = await this.subjects.create(tenantId, {
      type: 'vehicle',
      label: `${dto.make} ${dto.model} (${dto.rego})`,
      fields: { rego: dto.rego, make: dto.make, model: dto.model, year: dto.year },
      contactId: contact.id,
    });

    const job = await this.workItems.create(tenantId, {
      type: 'job',
      fields: { customerId: contact.id, description: dto.pickupNotes ?? '' },
      subjectIds: [vehicle.id],
      assignees: [dto.driverUserId],
    });

    // The tow detail lives on the dispatch sidecar, not on the job's fields — that shape is the Pack
    // Contract. Status starts at `dispatched`: the driver has been sent, they just have not left yet.
    await this.tenants.runInTenant(tenantId, (tx) =>
      tx.dispatch.upsert({
        where: { workItemId: job.id },
        create: {
          tenantId,
          workItemId: job.id,
          status: 'dispatched',
          pickupAddress: dto.pickupAddress,
          destinationYardId: yard.id,
          pickupNotes: dto.pickupNotes ?? null,
          updatedByUserId: bookedByUserId,
        },
        update: {
          status: 'dispatched',
          pickupAddress: dto.pickupAddress,
          destinationYardId: yard.id,
          pickupNotes: dto.pickupNotes ?? null,
          updatedByUserId: bookedByUserId,
        },
      }),
    );

    await this.notes.add(
      tenantId,
      job.id,
      bookedByUserId,
      `🛻 Tow booked — collect from ${dto.pickupAddress}, drop at ${yard.name}.`,
    );

    return this.view(tenantId, job.id);
  }

  /** Every tow this driver still has to do, oldest first. */
  async forDriver(tenantId: string, userId: string): Promise<TowJobView[]> {
    const rows = await this.tenants.runInTenant(tenantId, (tx) =>
      tx.dispatch.findMany({
        where: { pickupAddress: { not: null }, status: { not: 'completed' } },
        orderBy: { updatedAt: 'asc' },
        select: { workItemId: true },
      }),
    );
    const out: TowJobView[] = [];
    for (const r of rows) {
      const v = await this.view(tenantId, r.workItemId).catch(() => null);
      // assignees is the single source of who owns a job, so filter on it rather than trusting the
      // dispatch row — a reassignment only ever updates the job.
      if (v && v.assignedTo === userId) out.push(v);
    }
    return out;
  }

  /** The assembled driver-facing shape for one job. */
  async view(tenantId: string, jobId: string): Promise<TowJobView> {
    return this.tenants.runInTenant(tenantId, async (tx) => {
      const job = await tx.workItem.findFirst({
        where: { id: jobId, deletedAt: null },
        include: { subjects: { include: { subject: true } }, attachments: true },
      });
      if (!job) throw new NotFoundException('Job not found');

      const d = await tx.dispatch.findFirst({ where: { workItemId: jobId } });
      const yard = d?.destinationYardId
        ? await tx.yard.findFirst({ where: { id: d.destinationYardId } })
        : null;

      const subject = job.subjects.map((s) => s.subject).find((s) => s.type === 'vehicle');
      const f = (subject?.fields ?? {}) as Record<string, unknown>;
      const customerId = (job.fields as Record<string, unknown>)?.customerId as string | undefined;
      const contact = customerId
        ? await tx.contact.findFirst({ where: { id: customerId, deletedAt: null } })
        : null;

      const captions = job.attachments.map((a) => (a.caption ?? '').toLowerCase());
      const assignees = Array.isArray(job.assignees) ? (job.assignees as string[]) : [];

      return {
        jobId: job.id,
        reference: job.reference,
        status: d?.status ?? 'pending',
        pickupAddress: d?.pickupAddress ?? null,
        pickupNotes: d?.pickupNotes ?? null,
        dropOff: yard ? { yardId: yard.id, name: yard.name } : null,
        vehicle: subject
          ? {
              rego: String(f.rego ?? ''),
              make: String(f.make ?? ''),
              model: String(f.model ?? ''),
              year: typeof f.year === 'number' ? f.year : null,
            }
          : null,
        customer: contact ? { name: contact.displayName, phone: contact.phone } : null,
        photos: {
          pickup: captions.filter((c) => c.includes('tow pickup')).length,
          dropOff: captions.filter((c) => c.includes('tow drop')).length,
        },
        assignedTo: assignees[0] ?? null,
        updatedAt: d?.updatedAt ?? job.updatedAt,
      };
    });
  }

  private async findOrCreateContact(tenantId: string, name: string, phone: string) {
    const digits = phone.replace(/\D/g, '').slice(-9);
    if (digits.length >= 6) {
      const existing = await this.tenants.runInTenant(tenantId, (tx) =>
        tx.contact.findFirst({
          where: { deletedAt: null, phone: { contains: digits } },
          orderBy: { createdAt: 'asc' },
        }),
      );
      if (existing) return existing;
    }
    return this.contacts.create(tenantId, { displayName: name, phone });
  }
}

/**
 * Which end of the tow a photo belongs to.
 *
 * The category is carried in the caption string, because work-item attachments have no typed category
 * column — the convention is set where the driver uploads (TowJobCard) and read here. Matching is
 * loose on purpose: anything that is not clearly one leg is shown as "other" rather than silently
 * dropped, so a photo never disappears because a caption changed.
 */
function toTowPhoto(a: AttachmentView): TowPhoto {
  const c = (a.caption ?? '').toLowerCase();
  const leg: TowPhoto['leg'] = c.includes('tow pickup')
    ? 'pickup'
    : c.includes('tow drop')
      ? 'dropoff'
      : 'other';
  return {
    id: a.id,
    caption: a.caption,
    fileName: a.fileName,
    contentType: a.contentType,
    leg,
    uploadedAt: a.createdAt,
  };
}
