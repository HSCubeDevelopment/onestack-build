import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { SignDocumentDto } from './dto/document.dto';
import { PublicSignPage, SignatureService } from './signature.service';

/**
 * PUBLIC document sign page (card #143) — NO auth guard: the endpoint the tokenised sign link opens (secure
 * document exchange). Untrusted input, so the DTO length-caps the typed name + a honeypot, and the tenant
 * is resolved from the unguessable token via the BYPASSRLS admin connection (never a client id). The built-in
 * flow records a typed-name acknowledgement — NOT a certified/legally-binding e-signature (a deferred vendor).
 */
@Controller('public/documents')
export class PublicSignatureController {
  constructor(private readonly signatures: SignatureService) {}

  @Get('sign/:token')
  page(@Param('token') token: string): Promise<PublicSignPage> {
    return this.signatures.publicPage(token);
  }

  @Post('sign/:token')
  sign(
    @Param('token') token: string,
    @Body() dto: SignDocumentDto,
  ): Promise<{ status: 'signed' | 'declined'; certified: boolean }> {
    return this.signatures.sign(token, dto);
  }
}
