import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { AuthContext } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { DocumentRecordService, DocumentRecordView } from './document-record.service';
import { GenerateDocumentDto, RequestSignatureDto } from './dto/document.dto';
import { SignatureService, SignatureView } from './signature.service';

/**
 * Documents & e-signature — owner (card #143). Generate a document from a template, list/download a
 * job's documents, and request an e-signature (returns an unguessable public sign link). Tenant-scoped.
 * A legally-binding CERTIFIED e-signature is a deferred vendor; the built-in flow is an acknowledgement.
 */
@Controller('documents')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DocumentsController {
  constructor(
    private readonly documents: DocumentRecordService,
    private readonly signatures: SignatureService,
  ) {}

  @Post()
  generate(
    @CurrentUser() user: AuthContext,
    @Body() dto: GenerateDocumentDto,
  ): Promise<DocumentRecordView> {
    return this.documents.generate(user.tenantId, dto);
  }

  @Get()
  list(
    @CurrentUser() user: AuthContext,
    @Query('parentType') parentType: string,
    @Query('parentId') parentId: string,
  ): Promise<DocumentRecordView[]> {
    return this.documents.list(user.tenantId, parentType, parentId);
  }

  @Get(':id/content')
  content(@CurrentUser() user: AuthContext, @Param('id') id: string): Promise<string> {
    return this.documents.download(user.tenantId, id);
  }

  @Post(':id/signature-request')
  requestSignature(
    @CurrentUser() user: AuthContext,
    @Param('id') id: string,
    @Body() dto: RequestSignatureDto,
  ): Promise<SignatureView> {
    return this.signatures.request(user.tenantId, id, dto, user.userId);
  }

  @Get(':id/signatures')
  signatures_(@CurrentUser() user: AuthContext, @Param('id') id: string): Promise<SignatureView[]> {
    return this.signatures.listForDocument(user.tenantId, id);
  }
}
