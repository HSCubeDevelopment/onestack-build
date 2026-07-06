import { Body, Controller, Param, Post } from '@nestjs/common';
import { LeadService } from './lead.service';
import { PublicLeadDto } from './dto/lead.dto';

/**
 * PUBLIC lead intake (card #12) — NO auth guard: this is the endpoint the embeddable form / hosted page
 * posts to. Untrusted input, so: the DTO validates + length-caps every field, a honeypot drops obvious
 * bots, and the tenant is resolved from the unguessable form token (never from client-supplied ids).
 */
@Controller('public/lead-forms')
export class PublicLeadController {
  constructor(private readonly leads: LeadService) {}

  @Post(':token/submit')
  submit(@Param('token') token: string, @Body() dto: PublicLeadDto): Promise<{ received: true }> {
    return this.leads.submitPublic(token, dto);
  }
}
