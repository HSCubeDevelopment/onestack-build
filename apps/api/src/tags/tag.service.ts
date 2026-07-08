import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ContactsService } from '../contacts/contacts.service';
import { TenantService } from '../tenancy/tenant.service';
import { normaliseTagName, sameTagName } from './tag-name';

export interface TagView {
  id: string;
  name: string;
  color: string | null;
  contactCount: number;
}

export interface ContactSummary {
  id: string;
  displayName: string;
  email: string | null;
  phone: string | null;
}

/**
 * Segmentation & tagging (Phase 3). A shop defines named tags and assigns them to contacts, so customers
 * can be grouped ("segments") for targeted comms and reporting. Generic CRM — a tag is a plain label on
 * the shared Contact record. Tenant-scoped via the central wrapper; a contact is validated through the
 * ContactsService public API (never its table). Nothing here sends anything — segments are read-models.
 */
@Injectable()
export class TagService {
  constructor(
    private readonly tenants: TenantService,
    private readonly contacts: ContactsService,
  ) {}

  async createTag(tenantId: string, name: string, color?: string): Promise<TagView> {
    const clean = normaliseTagName(name, (m) => new BadRequestException(m));
    return this.tenants.runInTenant(tenantId, async (tx) => {
      const dupe = await tx.tag.findFirst({
        where: { name: { equals: clean, mode: 'insensitive' } },
      });
      if (dupe) throw new ConflictException(`A tag named "${clean}" already exists`);
      const row = await tx.tag.create({
        data: { tenantId, name: clean, color: color?.trim() || null },
      });
      return { id: row.id, name: row.name, color: row.color, contactCount: 0 };
    });
  }

  /** All tags with how many contacts each groups (the segment sizes). */
  async listTags(tenantId: string): Promise<TagView[]> {
    return this.tenants.runInTenant(tenantId, async (tx) => {
      const [tags, counts] = await Promise.all([
        tx.tag.findMany({ orderBy: { name: 'asc' } }),
        tx.contactTag.groupBy({ by: ['tagId'], _count: { contactId: true } }),
      ]);
      const countByTag = new Map(counts.map((c) => [c.tagId, c._count.contactId]));
      return tags.map((t) => ({
        id: t.id,
        name: t.name,
        color: t.color,
        contactCount: countByTag.get(t.id) ?? 0,
      }));
    });
  }

  async updateTag(
    tenantId: string,
    id: string,
    patch: { name?: string; color?: string | null },
  ): Promise<TagView> {
    const name =
      patch.name !== undefined
        ? normaliseTagName(patch.name, (m) => new BadRequestException(m))
        : undefined;
    return this.tenants.runInTenant(tenantId, async (tx) => {
      const tag = await tx.tag.findFirst({ where: { id } });
      if (!tag) throw new NotFoundException('Tag not found');
      if (name !== undefined && !sameTagName(name, tag.name)) {
        const dupe = await tx.tag.findFirst({
          where: { name: { equals: name, mode: 'insensitive' } },
        });
        if (dupe) throw new ConflictException(`A tag named "${name}" already exists`);
      }
      const row = await tx.tag.update({
        where: { id },
        data: {
          ...(name !== undefined ? { name } : {}),
          ...(patch.color !== undefined ? { color: patch.color?.trim() || null } : {}),
        },
      });
      const contactCount = await tx.contactTag.count({ where: { tagId: id } });
      return { id: row.id, name: row.name, color: row.color, contactCount };
    });
  }

  /** Delete a tag; its assignments go with it (cascade). */
  async deleteTag(tenantId: string, id: string): Promise<void> {
    await this.tenants.runInTenant(tenantId, async (tx) => {
      const tag = await tx.tag.findFirst({ where: { id } });
      if (!tag) throw new NotFoundException('Tag not found');
      await tx.tag.deleteMany({ where: { id } });
    });
  }

  /** Assign a tag to a contact (idempotent — assigning an already-tagged contact is a no-op). */
  async assign(tenantId: string, contactId: string, tagId: string): Promise<void> {
    await this.contacts.get(tenantId, contactId); // 404s for a missing/other-tenant contact
    await this.tenants.runInTenant(tenantId, async (tx) => {
      const tag = await tx.tag.findFirst({ where: { id: tagId } });
      if (!tag) throw new NotFoundException('Tag not found');
      const existing = await tx.contactTag.findFirst({ where: { tagId, contactId } });
      if (!existing) {
        await tx.contactTag.create({ data: { tenantId, tagId, contactId } });
      }
    });
  }

  async unassign(tenantId: string, contactId: string, tagId: string): Promise<void> {
    await this.tenants.runInTenant(tenantId, (tx) =>
      tx.contactTag.deleteMany({ where: { tagId, contactId } }),
    );
  }

  /** The tags currently on a contact. */
  async tagsForContact(tenantId: string, contactId: string): Promise<TagView[]> {
    await this.contacts.get(tenantId, contactId);
    return this.tenants.runInTenant(tenantId, async (tx) => {
      const links = await tx.contactTag.findMany({ where: { contactId }, include: { tag: true } });
      return links
        .map((l) => ({ id: l.tag.id, name: l.tag.name, color: l.tag.color, contactCount: 0 }))
        .sort((a, b) => a.name.localeCompare(b.name));
    });
  }

  /** The contacts a tag groups — the segment. */
  async contactsForTag(tenantId: string, tagId: string): Promise<ContactSummary[]> {
    return this.tenants.runInTenant(tenantId, async (tx) => {
      const tag = await tx.tag.findFirst({ where: { id: tagId } });
      if (!tag) throw new NotFoundException('Tag not found');
      const links = await tx.contactTag.findMany({
        where: { tagId },
        include: { contact: true },
      });
      return links
        .filter((l) => l.contact.deletedAt === null)
        .map((l) => ({
          id: l.contact.id,
          displayName: l.contact.displayName,
          email: l.contact.email,
          phone: l.contact.phone,
        }))
        .sort((a, b) => a.displayName.localeCompare(b.displayName));
    });
  }
}
