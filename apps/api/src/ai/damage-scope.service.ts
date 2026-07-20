import {
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { TenantService } from '../tenancy/tenant.service';
import { AttachmentService } from '../work-items/attachment.service';
import { SimilarJobsService } from './similar-jobs.service';
import {
  DAMAGE_ANALYZER,
  DAMAGE_OPERATIONS,
  MAX_PRECEDENTS,
  DamagePrecedent,
  DamageAnalyzer,
  DamageOperation,
  MAX_ANALYSIS_IMAGES,
} from './damage-analyzer';

/** A single line of a scope as stored/returned — like the analyzer item but with a stable id for editing. */
export interface DamageScopeItemView {
  id: string;
  panel: string;
  operation: DamageOperation;
  note: string | null;
  confidence: number | null;
}

export interface DamageScopeView {
  id: string;
  workItemId: string;
  status: 'draft' | 'applied';
  source: 'ai' | 'manual';
  model: string;
  summary: string;
  photoCount: number;
  items: DamageScopeItemView[];
  createdAt: Date;
  updatedAt: Date;
}

/** Edit payload — a full replace of the human-editable fields. Undefined fields are left as-is. */
export interface EditDamageScopeInput {
  summary?: string;
  items?: {
    panel: string;
    operation: DamageOperation;
    note?: string | null;
    confidence?: number | null;
  }[];
}

/** Image MIME types we hand to an analyzer. Non-images on the job are ignored. */
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);

/**
 * Damage-scope service (Phase 2 flagship, slice A). Turns a job's photos into an editable draft scope:
 *   1. read the job's photos (via AttachmentService — tenant-scoped),
 *   2. run the configured AI gateway (real Claude vision, or the deterministic stub with no key),
 *   3. persist the result as a DRAFT the estimator edits before anything is priced.
 *
 * Every write goes through the central tenant wrapper, so a shop only ever sees its own scopes. Nothing
 * here sends or orders anything — it only proposes. A job keeps a single current draft: re-generating
 * replaces it, so the estimator never has to reconcile stale AI runs.
 */
@Injectable()
export class DamageScopeService {
  constructor(
    private readonly tenants: TenantService,
    private readonly attachments: AttachmentService,
    @Inject(DAMAGE_ANALYZER) private readonly analyzer: DamageAnalyzer,
    private readonly similarJobs: SimilarJobsService,
  ) {}

  /** Run the AI over the job's photos and (re)create its draft scope. */
  async generate(tenantId: string, jobId: string): Promise<DamageScopeView> {
    // Confirm the job exists for this tenant before doing any AI work.
    await this.tenants.runInTenant(tenantId, async (tx) => {
      const job = await tx.workItem.findFirst({ where: { id: jobId, deletedAt: null } });
      if (!job) throw new NotFoundException('Job not found');
    });

    // Gather the job's photos (tenant-scoped). At least one is required to propose a scope.
    const photos = (await this.attachments.list(tenantId, jobId)).filter((a) =>
      IMAGE_TYPES.has(a.contentType),
    );
    if (photos.length === 0) {
      throw new BadRequestException(
        'Attach at least one photo to the job before generating a scope',
      );
    }

    // Cost cap: only the first MAX_ANALYSIS_IMAGES photos are sent to the model.
    const used = photos.slice(0, MAX_ANALYSIS_IMAGES);
    const images = await Promise.all(
      used.map(async (p) => {
        const { bytes, contentType } = await this.attachments.getContent(tenantId, p.id);
        return { contentType, dataBase64: bytes.toString('base64') };
      }),
    );

    // Card 60.5 — ground the draft in this shop's own comparable jobs. Retrieval failing must never
    // block a scope: an ungrounded draft is the normal state for a shop with no history yet, so a
    // broken index degrades to today's behaviour instead of taking the feature down with it.
    let precedents: DamagePrecedent[] = [];
    try {
      const matches = await this.similarJobs.findSimilarByPhotos(
        tenantId,
        jobId,
        used.map((photo, i) => ({
          attachmentId: photo.id,
          contentType: images[i]?.contentType ?? photo.contentType,
          dataBase64: images[i]?.dataBase64 ?? '',
        })),
        MAX_PRECEDENTS,
      );
      precedents = matches.map((m) => ({ summary: m.bestSnippet, similarity: m.similarity }));
    } catch {
      precedents = [];
    }

    let result;
    try {
      result = await this.analyzer.analyze({ images, precedents });
    } catch (err) {
      throw new InternalServerErrorException(
        `AI scope generation failed: ${err instanceof Error ? err.message : 'unknown error'}`,
      );
    }

    const items = result.items.map((i) => ({
      id: randomUUID(),
      panel: i.panel,
      operation: i.operation,
      note: i.note ?? null,
      confidence: i.confidence ?? null,
    }));

    return this.tenants.runInTenant(tenantId, async (tx) => {
      // One current draft per job — clear any prior draft first.
      await tx.damageScope.deleteMany({ where: { workItemId: jobId, status: 'draft' } });
      const row = await tx.damageScope.create({
        data: {
          tenantId,
          workItemId: jobId,
          status: 'draft',
          source: 'ai',
          model: this.analyzer.name,
          summary: result.summary,
          items,
          photoCount: used.length,
        },
      });
      return toView(row);
    });
  }

  /** The job's current draft scope, or 404 if none has been generated. */
  async getForJob(tenantId: string, jobId: string): Promise<DamageScopeView> {
    const row = await this.tenants.runInTenant(tenantId, async (tx) => {
      const job = await tx.workItem.findFirst({ where: { id: jobId, deletedAt: null } });
      if (!job) throw new NotFoundException('Job not found');
      return tx.damageScope.findFirst({
        where: { workItemId: jobId },
        orderBy: { createdAt: 'desc' },
      });
    });
    if (!row) throw new NotFoundException('No damage scope for this job');
    return toView(row);
  }

  /** Edit the draft — the estimator's confirmation step. Full replace of summary and/or items. */
  async edit(
    tenantId: string,
    scopeId: string,
    patch: EditDamageScopeInput,
  ): Promise<DamageScopeView> {
    const items =
      patch.items !== undefined
        ? patch.items.map((i, idx) => {
            const panel = i.panel?.trim();
            if (!panel) throw new BadRequestException(`items[${idx}].panel is required`);
            if (!DAMAGE_OPERATIONS.includes(i.operation))
              throw new BadRequestException(
                `items[${idx}].operation must be one of ${DAMAGE_OPERATIONS.join(', ')}`,
              );
            return {
              id: randomUUID(),
              panel,
              operation: i.operation,
              note: i.note?.trim() || null,
              confidence:
                i.confidence === undefined || i.confidence === null
                  ? null
                  : Math.max(0, Math.min(1, i.confidence)),
            };
          })
        : undefined;

    return this.tenants.runInTenant(tenantId, async (tx) => {
      const row = await tx.damageScope.findFirst({ where: { id: scopeId } });
      if (!row) throw new NotFoundException('Damage scope not found');
      const updated = await tx.damageScope.update({
        where: { id: scopeId },
        data: {
          ...(patch.summary !== undefined ? { summary: patch.summary.trim() } : {}),
          ...(items !== undefined ? { items, source: 'manual' } : {}),
        },
      });
      return toView(updated);
    });
  }

  async remove(tenantId: string, scopeId: string): Promise<void> {
    await this.tenants.runInTenant(tenantId, async (tx) => {
      const row = await tx.damageScope.findFirst({ where: { id: scopeId } });
      if (!row) throw new NotFoundException('Damage scope not found');
      await tx.damageScope.deleteMany({ where: { id: scopeId } });
    });
  }
}

interface DamageScopeRow {
  id: string;
  workItemId: string;
  status: string;
  source: string;
  model: string;
  summary: string;
  items: unknown;
  photoCount: number;
  createdAt: Date;
  updatedAt: Date;
}

function toView(row: DamageScopeRow): DamageScopeView {
  const rawItems = Array.isArray(row.items) ? (row.items as Record<string, unknown>[]) : [];
  return {
    id: row.id,
    workItemId: row.workItemId,
    status: row.status as 'draft' | 'applied',
    source: row.source as 'ai' | 'manual',
    model: row.model,
    summary: row.summary,
    photoCount: row.photoCount,
    items: rawItems.map((i) => ({
      id: String(i.id),
      panel: String(i.panel),
      operation: i.operation as DamageOperation,
      note: i.note == null ? null : String(i.note),
      confidence: typeof i.confidence === 'number' ? i.confidence : null,
    })),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
