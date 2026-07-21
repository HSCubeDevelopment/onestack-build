import { Injectable } from '@nestjs/common';
import { ContactsService } from '../contacts/contacts.service';
import { NotificationService } from '../notifications/notification.service';
import { SubjectService } from '../subjects/subject.service';
import { NoteService } from '../work-items/note.service';
import { WorkItemService, WorkItemView } from '../work-items/work-item.service';
import { CreateTowCollectionDto } from './dto/tow.dto';
import { normRego } from './yards.util';

export interface TowCollectionResult {
  job: WorkItemView;
}

/**
 * Tow collection (YRD-2). A tow driver records a pickup and the office gets a job file without anyone
 * re-keying it. This is pure orchestration over existing services — it owns no tables:
 *   contact → vehicle → job (Booked) → a timeline note → notify the team.
 *
 * Each step is its own service call (its own transaction); they run in order, so a failure part-way
 * surfaces before the next step. The pickup location is captured as a note (it shows in the job's
 * timeline) rather than a new job field, which would require a Pack-Contract change.
 */
@Injectable()
export class TowService {
  constructor(
    private readonly contacts: ContactsService,
    private readonly subjects: SubjectService,
    private readonly workItems: WorkItemService,
    private readonly notes: NoteService,
    private readonly notifications: NotificationService,
  ) {}

  async collect(
    tenantId: string,
    userId: string,
    dto: CreateTowCollectionDto,
  ): Promise<TowCollectionResult> {
    const rego = normRego(dto.rego);
    const make = dto.make.trim();
    const model = dto.model.trim();
    const pickup = dto.pickupLocation.trim();

    // 1. The customer.
    const contact = await this.contacts.create(tenantId, {
      displayName: dto.customerName.trim(),
      phone: dto.customerPhone.trim(),
    });

    // 2. The car.
    const vehicle = await this.subjects.create(tenantId, {
      type: 'vehicle',
      label: `${make} ${model} (${rego})`,
      fields: { rego, make, model, year: dto.year },
      contactId: contact.id,
    });

    // 3. The job — assigned to the collecting driver so a STAFF tow driver can see it immediately.
    const job = await this.workItems.create(tenantId, {
      type: 'job',
      fields: { customerId: contact.id, description: dto.comments?.trim() || undefined },
      subjectIds: [vehicle.id],
      assignees: [userId],
    });

    // 4. The tow-in, on the job's timeline.
    await this.notes.add(
      tenantId,
      job.id,
      userId,
      `🚗 Towed in — picked up from ${pickup}. Job auto-created from a tow collection.`,
    );

    // 5. Tell the team a car has landed. in_app: the row IS the notification; delivery is persistence.
    await this.notifications.enqueue({
      tenantId,
      channel: 'in_app',
      recipient: 'team',
      template: 'tow.job_created',
      payload: { jobId: job.id, reference: job.reference, rego, pickupLocation: pickup },
    });

    return { job };
  }
}
