import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantService } from '../tenancy/tenant.service';
import { CreateTicketDto, TicketStatus } from './dto/ticket.dto';
import {
  MAX_TICKET_FILES,
  TICKET_EXTRACTOR,
  TicketExtraction,
  TicketExtractor,
  TicketFile,
} from './ticket-extractor';
import { TICKET_FILE_STORAGE, TicketFileStorage } from './ticket-file-storage';

/** Content types we accept for a ticket file. Photos are usually compressed to JPEG by the client. */
const STORABLE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
  'application/pdf',
]);

/** Normalise a rego for storage + lookup: trimmed, uppercased, spaces removed (matches the fleet rule). */
export function normaliseRego(raw: string): string {
  return raw.replace(/\s+/g, '').toUpperCase();
}

export interface TicketView {
  id: string;
  rego: string;
  regoRaw: string;
  noticeType: string;
  noticeNumber: string;
  agency: string;
  offence: string;
  offenceCode: string;
  offenceAt: string;
  location: string;
  issueDate: string;
  dueDate: string;
  amountDueCents: number;
  status: string;
  source: string;
  data: Record<string, unknown>;
  hasFile: boolean;
  createdByUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TicketExtractResult {
  model: string;
  extraction: TicketExtraction;
}

/**
 * Tickets — infringement / police notices captured against a car. Replaces the manual form: an employee
 * uploads a PDF or photographs the notice, AI extracts the fields as an editable draft (a human confirms),
 * and the confirmed ticket is stored here (queryable by rego / status / due date) with the original file in
 * private Storage. Tenant-scoped throughout via runInTenant; the extractor and storage are provider
 * boundaries injected by token (real Anthropic + Supabase in prod, stubs otherwise). Nothing is auto-filed.
 */
@Injectable()
export class TicketsService {
  constructor(
    private readonly tenants: TenantService,
    @Inject(TICKET_EXTRACTOR) private readonly extractor: TicketExtractor,
    @Inject(TICKET_FILE_STORAGE) private readonly storage: TicketFileStorage,
  ) {}

  /** Run AI extraction over captured files and return an editable draft. Saves nothing (golden rule). */
  async extract(files: TicketFile[]): Promise<TicketExtractResult> {
    if (files.length === 0) throw new BadRequestException('No files to extract from');
    for (const f of files) {
      if (!STORABLE_TYPES.has(f.contentType))
        throw new BadRequestException(`Unsupported file type: ${f.contentType}`);
      if (!f.dataBase64 || Buffer.from(f.dataBase64, 'base64').length === 0)
        throw new BadRequestException('Empty file');
    }
    const extraction = await this.extractor.extract(files.slice(0, MAX_TICKET_FILES));
    return { model: this.extractor.name, extraction };
  }

  /** Save a confirmed ticket + (optionally) its original file. */
  async create(tenantId: string, userId: string, dto: CreateTicketDto): Promise<TicketView> {
    const regoRaw = dto.rego.trim();
    const rego = normaliseRego(regoRaw);
    if (!rego) throw new BadRequestException('A registration is required');

    let fileStoragePath: string | null = null;
    let fileContentType: string | null = null;
    if (dto.file) {
      if (!STORABLE_TYPES.has(dto.file.contentType))
        throw new BadRequestException(`Unsupported file type: ${dto.file.contentType}`);
      let bytes: Buffer;
      try {
        bytes = Buffer.from(dto.file.dataBase64, 'base64');
      } catch {
        throw new BadRequestException('file.dataBase64 is not valid base64');
      }
      if (bytes.length === 0) throw new BadRequestException('Empty file');
      fileStoragePath = await this.storage.put(tenantId, bytes, dto.file.contentType);
      fileContentType = dto.file.contentType;
    }

    const offenceAt = [dto.offenceDate, dto.offenceTime]
      .map((s) => (s ?? '').trim())
      .join(' ')
      .trim();
    const data: Record<string, unknown> = dto.data ?? {
      infringementNumber: dto.infringementNumber ?? '',
      obligationNumber: dto.obligationNumber ?? '',
      state: dto.state ?? '',
      offenceDate: dto.offenceDate ?? '',
      offenceTime: dto.offenceTime ?? '',
      penaltyCents: dto.penaltyCents ?? 0,
      feesCents: dto.feesCents ?? 0,
      recipientName: dto.recipientName ?? '',
      recipientAbn: dto.recipientAbn ?? '',
      recipientAddress: dto.recipientAddress ?? '',
      notes: dto.notes ?? '',
    };

    return this.tenants.runInTenant(tenantId, async (tx) => {
      const row = await tx.ticket.create({
        data: {
          tenantId,
          rego,
          regoRaw,
          noticeType: dto.noticeType ?? '',
          noticeNumber: (dto.noticeNumber ?? '').trim(),
          agency: dto.agency ?? '',
          offence: dto.offence ?? '',
          offenceCode: dto.offenceCode ?? '',
          offenceAt,
          location: dto.location ?? '',
          issueDate: dto.issueDate ?? '',
          dueDate: dto.dueDate ?? '',
          amountDueCents: dto.amountDueCents ?? 0,
          status: 'open',
          source: dto.source === 'pdf' ? 'pdf' : 'photo',
          data: data as Prisma.InputJsonValue,
          fileStoragePath,
          fileContentType,
          createdByUserId: userId,
        },
      });
      return toView(row);
    });
  }

  /** List tickets, newest first, optionally filtered by rego and/or status. */
  async list(tenantId: string, filter: { rego?: string; status?: string }): Promise<TicketView[]> {
    const where: Record<string, unknown> = {};
    if (filter.rego) where.rego = normaliseRego(filter.rego);
    if (filter.status) where.status = filter.status;
    return this.tenants.runInTenant(tenantId, async (tx) => {
      const rows = await tx.ticket.findMany({ where, orderBy: { createdAt: 'desc' } });
      return rows.map(toView);
    });
  }

  async get(tenantId: string, id: string): Promise<TicketView> {
    return this.tenants.runInTenant(tenantId, async (tx) => {
      const row = await tx.ticket.findFirst({ where: { id } });
      if (!row) throw new NotFoundException('Ticket not found');
      return toView(row);
    });
  }

  async updateStatus(tenantId: string, id: string, status: TicketStatus): Promise<TicketView> {
    return this.tenants.runInTenant(tenantId, async (tx) => {
      const existing = await tx.ticket.findFirst({ where: { id } });
      if (!existing) throw new NotFoundException('Ticket not found');
      const row = await tx.ticket.update({ where: { id }, data: { status } });
      return toView(row);
    });
  }

  /** Stream the original notice file's bytes (found under RLS first, then fetched from Storage). */
  async fileContent(tenantId: string, id: string): Promise<{ bytes: Buffer; contentType: string }> {
    const row = await this.tenants.runInTenant(tenantId, async (tx) =>
      tx.ticket.findFirst({ where: { id } }),
    );
    if (!row || !row.fileStoragePath) throw new NotFoundException('No file for this ticket');
    const bytes = await this.storage.get(tenantId, row.fileStoragePath);
    return { bytes, contentType: row.fileContentType ?? 'application/octet-stream' };
  }
}

interface TicketRow {
  id: string;
  rego: string;
  regoRaw: string;
  noticeType: string;
  noticeNumber: string;
  agency: string;
  offence: string;
  offenceCode: string;
  offenceAt: string;
  location: string;
  issueDate: string;
  dueDate: string;
  amountDueCents: number;
  status: string;
  source: string;
  data: unknown;
  fileStoragePath: string | null;
  createdByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function toView(r: TicketRow): TicketView {
  return {
    id: r.id,
    rego: r.rego,
    regoRaw: r.regoRaw,
    noticeType: r.noticeType,
    noticeNumber: r.noticeNumber,
    agency: r.agency,
    offence: r.offence,
    offenceCode: r.offenceCode,
    offenceAt: r.offenceAt,
    location: r.location,
    issueDate: r.issueDate,
    dueDate: r.dueDate,
    amountDueCents: r.amountDueCents,
    status: r.status,
    source: r.source,
    data: r.data && typeof r.data === 'object' ? (r.data as Record<string, unknown>) : {},
    hasFile: !!r.fileStoragePath,
    createdByUserId: r.createdByUserId,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}
