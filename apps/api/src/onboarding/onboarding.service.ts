import { BadRequestException, Injectable } from '@nestjs/common';
import { BrandingService } from '../branding/branding.service';
import { ContactsService } from '../contacts/contacts.service';
import { OnlineBookingService } from '../online-booking/online-booking.service';
import { ResourceService } from '../scheduling/resource.service';
import { WorkItemService } from '../work-items/work-item.service';
import {
  ContactRow,
  ImportSummary,
  MAX_IMPORT_ROWS,
  parseContactsCsv,
  planImport,
  RowResult,
  summarise,
} from './import';

export interface ImportContactsInput {
  /** Raw CSV text (header + rows), OR a pre-parsed rows array — provide one. */
  csv?: string;
  rows?: Array<Record<string, string>>;
  /** Preview only — validate and report, write nothing. */
  dryRun?: boolean;
}

export interface ImportResult {
  dryRun: boolean;
  summary: ImportSummary;
  results: RowResult[];
  created: number;
}

export interface ChecklistStep {
  key: string;
  label: string;
  done: boolean;
}

export interface OnboardingChecklist {
  steps: ChecklistStep[];
  completed: number;
  total: number;
  complete: boolean;
}

/**
 * Onboarding & data migration (Phase 3, card #152). GENERIC core. Two jobs: (1) import a business's
 * existing customers from CSV — always previewable (dry-run), per-row, de-duplicated, capped, and a human
 * confirms before anything is written (never a silent bulk load); (2) a setup checklist that guides the
 * owner to first value fast. Composes existing services; owns no tables. Tenant-scoped.
 */
@Injectable()
export class OnboardingService {
  constructor(
    private readonly contacts: ContactsService,
    private readonly resources: ResourceService,
    private readonly booking: OnlineBookingService,
    private readonly branding: BrandingService,
    private readonly workItems: WorkItemService,
  ) {}

  /** Import customers from CSV. Dry-run by default-safe usage: preview the per-row plan, then confirm. */
  async importContacts(tenantId: string, input: ImportContactsInput): Promise<ImportResult> {
    const rawRows = input.csv !== undefined ? parseContactsCsv(input.csv) : (input.rows ?? []);
    if (rawRows.length === 0) throw new BadRequestException('No rows to import');
    if (rawRows.length > MAX_IMPORT_ROWS)
      throw new BadRequestException(`Too many rows — import at most ${MAX_IMPORT_ROWS} at a time`);

    // De-dupe against phones already on file.
    const existing = await this.contacts.list(tenantId);
    const existingPhones = new Set(existing.map((c) => c.phone).filter((p): p is string => !!p));

    const results = planImport(rawRows, existingPhones);
    const summary = summarise(results);

    let created = 0;
    if (!input.dryRun) {
      for (const r of results) {
        if (r.status !== 'ok' || !r.value) continue;
        try {
          await this.createContact(tenantId, r.value);
          created++;
        } catch (err) {
          r.status = 'error';
          r.message = err instanceof Error ? err.message : 'Failed to create';
        }
      }
    }

    return { dryRun: !!input.dryRun, summary, results, created };
  }

  private createContact(tenantId: string, value: ContactRow): Promise<unknown> {
    return this.contacts.create(tenantId, {
      displayName: value.displayName,
      phone: value.phone,
      ...(value.email ? { email: value.email } : {}),
    });
  }

  /** A setup checklist guiding the owner to first value. Read-only; computed from existing data. */
  async checklist(tenantId: string): Promise<OnboardingChecklist> {
    const [contacts, resources, page, brandSet, jobs] = await Promise.all([
      this.contacts.list(tenantId),
      this.resources.list(tenantId),
      this.booking.getConfig(tenantId),
      this.branding.exists(tenantId),
      this.workItems.list(tenantId),
    ]);

    const steps: ChecklistStep[] = [
      { key: 'brand', label: 'Set up your brand', done: brandSet },
      { key: 'customers', label: 'Add your customers', done: contacts.length > 0 },
      {
        key: 'resources',
        label: 'Add a bookable resource (bay or technician)',
        done: resources.length > 0,
      },
      {
        key: 'booking_page',
        label: 'Turn on your online booking page',
        done: page.exists && page.enabled,
      },
      { key: 'first_job', label: 'Create your first job', done: jobs.length > 0 },
    ];

    const completed = steps.filter((s) => s.done).length;
    return { steps, completed, total: steps.length, complete: completed === steps.length };
  }
}
