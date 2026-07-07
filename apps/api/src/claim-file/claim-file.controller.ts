import { Controller, Get, Param, Post, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { AuthContext } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import {
  ClaimDocument,
  ClaimFileExport,
  ClaimFileService,
  ClaimFileView,
} from './claim-file.service';
import { ShareResult } from './claim-pack-sharer';

/**
 * Claim file (Phase 2). View, export, or share the pack of artefacts for a claim against a job. All
 * routes are tenant-scoped by the service (the job lookup 404s for other tenants). Export is a
 * self-contained download; share goes through the vendor boundary (no-op until a provider is wired).
 */
@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class ClaimFileController {
  constructor(private readonly claims: ClaimFileService) {}

  @Get('work-items/:jobId/claim-file')
  get(@CurrentUser() user: AuthContext, @Param('jobId') jobId: string): Promise<ClaimFileView> {
    return this.claims.assemble(user.tenantId, jobId);
  }

  @Get('work-items/:jobId/claim-file/export')
  async export(
    @CurrentUser() user: AuthContext,
    @Param('jobId') jobId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ClaimFileExport> {
    const pack = await this.claims.exportPack(user.tenantId, jobId, new Date());
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="claim-${pack.job.reference}.json"`);
    return pack;
  }

  /** Vendor boundary: shares the pack if a provider is configured; otherwise reports it wasn't shared. */
  @Post('work-items/:jobId/claim-file/share')
  share(@CurrentUser() user: AuthContext, @Param('jobId') jobId: string): Promise<ShareResult> {
    return this.claims.share(user.tenantId, jobId);
  }

  /** Generate a claim-summary document for the job; it joins the pack's documents list. */
  @Post('work-items/:jobId/claim-file/document')
  generateDocument(
    @CurrentUser() user: AuthContext,
    @Param('jobId') jobId: string,
  ): Promise<ClaimDocument> {
    return this.claims.generateDocument(user.tenantId, jobId, new Date());
  }

  /** Download a generated document's content (tenant-scoped). */
  @Get('claim-file/documents/:documentId/content')
  async downloadDocument(
    @CurrentUser() user: AuthContext,
    @Param('documentId') documentId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<string> {
    const content = await this.claims.downloadDocument(user.tenantId, documentId);
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="document-${documentId}.txt"`);
    return content;
  }
}
