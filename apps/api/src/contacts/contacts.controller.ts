import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AuthContext } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { ContactsService, ContactView } from './contacts.service';
import { CreateContactDto } from './dto/create-contact.dto';

@Controller('contacts')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ContactsController {
  constructor(private readonly contacts: ContactsService) {}

  // Any authenticated user in the tenant may create/list. The tenant is taken from the verified
  // token — a caller can never act on another tenant (guard + RLS both enforce it).
  @Post()
  create(@CurrentUser() user: AuthContext, @Body() dto: CreateContactDto): Promise<ContactView> {
    return this.contacts.create(user.tenantId, dto);
  }

  @Get()
  list(@CurrentUser() user: AuthContext): Promise<ContactView[]> {
    return this.contacts.list(user.tenantId);
  }

  // Owner-only route — demonstrates RBAC gating (card #3). STAFF → 403, OWNER → 200.
  @Get('owner-only')
  @Roles('OWNER')
  ownerOnly(): { ok: true } {
    return { ok: true };
  }
}
