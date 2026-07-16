import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { TenantService } from '../tenancy/tenant.service';
import { DOCUMENT_STORAGE, DocumentStorage } from './document-storage';
import {
  ESIGNATURE_PROVIDER,
  ESignatureProvider,
  MAX_SIGNED_NAME_CHARS,
} from './esignature-provider';

export interface SignatureView {
  id: string;
  documentId: string;
  signerName: string;
  signerEmail: string | null;
  status: 'pending' | 'signed' | 'declined';
  signedName: string | null;
  signedAt: string | null;
  provider: string;
  certified: boolean;
  /** Relative path of the tokenised public sign page (secure document exchange). */
  signUrl: string;
  createdAt: string;
}

/** What the public (no-auth) sign page shows the signer. */
export interface PublicSignPage {
  status: 'pending' | 'signed' | 'declined';
  signerName: string;
  documentType: string;
  /** The rendered document content to review before signing. */
  content: string;
  /** False for the built-in acknowledgement; a certified provider sets it true. */
  certified: boolean;
}

function signUrlFor(token: string): string {
  return `/public/documents/sign/${token}`;
}

/**
 * E-signature on generated documents (card #143). Owner requests a signature on a document; an unguessable
 * token opens a public sign page (secure document exchange) where the signer reviews the document and signs
 * by typed-name acknowledgement. A legally-binding CERTIFIED e-signature is a deferred vendor (see
 * ESignatureProvider). Tenant-scoped; the public token resolves the tenant via the BYPASSRLS admin
 * connection (never a client id), then all writes go through runInTenant. Nothing auto-sends.
 */
@Injectable()
export class SignatureService {
  constructor(
    private readonly tenants: TenantService,
    private readonly prisma: PrismaService,
    @Inject(DOCUMENT_STORAGE) private readonly storage: DocumentStorage,
    @Inject(ESIGNATURE_PROVIDER) private readonly provider: ESignatureProvider,
  ) {}

  /** Owner: request a signature on one of this tenant's documents. Returns the shareable sign link. */
  async request(
    tenantId: string,
    documentId: string,
    input: { signerName: string; signerEmail?: string },
    userId: string,
  ): Promise<SignatureView> {
    const signerName = input.signerName?.trim();
    if (!signerName) throw new BadRequestException('signerName is required');

    // The document must belong to this tenant (RLS on the row).
    const doc = await this.tenants.runInTenant(tenantId, (tx) =>
      tx.document.findFirst({ where: { id: documentId } }),
    );
    if (!doc) throw new NotFoundException('Document not found');

    const token = randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, '');
    const result = await this.provider.request({ documentId, signerName, token });

    const row = await this.tenants.runInTenant(tenantId, (tx) =>
      tx.documentSignature.create({
        data: {
          tenantId,
          documentId,
          token,
          signerName,
          signerEmail: input.signerEmail?.trim() || null,
          status: 'pending',
          provider: result.provider,
          certified: result.certified,
          requestedByUserId: userId,
        },
      }),
    );
    return toView(row);
  }

  /** Owner: the signature requests on a document + their statuses. */
  async listForDocument(tenantId: string, documentId: string): Promise<SignatureView[]> {
    const rows = await this.tenants.runInTenant(tenantId, (tx) =>
      tx.documentSignature.findMany({ where: { documentId }, orderBy: { createdAt: 'desc' } }),
    );
    return rows.map(toView);
  }

  /** PUBLIC: what the tokenised sign page shows — the document to review + current status. */
  async publicPage(token: string): Promise<PublicSignPage> {
    const sig = await this.resolve(token);
    const doc = await this.tenants.runInTenant(sig.tenantId, (tx) =>
      tx.document.findFirst({ where: { id: sig.documentId } }),
    );
    if (!doc) throw new NotFoundException('Document not found');
    const content = await this.storage.get(sig.tenantId, doc.storageRef);
    return {
      status: sig.status as PublicSignPage['status'],
      signerName: sig.signerName,
      documentType: doc.type,
      content,
      certified: sig.certified,
    };
  }

  /** PUBLIC: sign (typed-name acknowledgement) or decline. Untrusted input — the name is length-capped. */
  async sign(
    token: string,
    input: { signedName?: string; decline?: boolean; website?: string },
  ): Promise<{ status: 'signed' | 'declined'; certified: boolean }> {
    if (input.website) return { status: 'signed', certified: false }; // honeypot: pretend success, do nothing
    const sig = await this.resolve(token);
    if (sig.status !== 'pending')
      throw new ConflictException(`This document has already been ${sig.status}`);

    if (input.decline) {
      await this.tenants.runInTenant(sig.tenantId, (tx) =>
        tx.documentSignature.update({ where: { id: sig.id }, data: { status: 'declined' } }),
      );
      return { status: 'declined', certified: sig.certified };
    }

    const signedName = input.signedName?.trim();
    if (!signedName) throw new BadRequestException('signedName is required to sign');
    if (signedName.length > MAX_SIGNED_NAME_CHARS)
      throw new BadRequestException(
        `signedName must be ${MAX_SIGNED_NAME_CHARS} characters or fewer`,
      );

    await this.tenants.runInTenant(sig.tenantId, (tx) =>
      tx.documentSignature.update({
        where: { id: sig.id },
        data: { status: 'signed', signedName, signedAt: new Date() },
      }),
    );
    return { status: 'signed', certified: sig.certified };
  }

  private async resolve(token: string): Promise<{
    id: string;
    tenantId: string;
    documentId: string;
    signerName: string;
    status: string;
    certified: boolean;
  }> {
    const sig = await this.prisma.documentSignature.findFirst({
      where: { token },
      select: {
        id: true,
        tenantId: true,
        documentId: true,
        signerName: true,
        status: true,
        certified: true,
      },
    });
    if (!sig) throw new NotFoundException('Signature request not found');
    return sig;
  }
}

function toView(r: {
  id: string;
  documentId: string;
  token: string;
  signerName: string;
  signerEmail: string | null;
  status: string;
  signedName: string | null;
  signedAt: Date | null;
  provider: string;
  certified: boolean;
  createdAt: Date;
}): SignatureView {
  return {
    id: r.id,
    documentId: r.documentId,
    signerName: r.signerName,
    signerEmail: r.signerEmail,
    status: r.status as SignatureView['status'],
    signedName: r.signedName,
    signedAt: r.signedAt ? r.signedAt.toISOString() : null,
    provider: r.provider,
    certified: r.certified,
    signUrl: signUrlFor(r.token),
    createdAt: r.createdAt.toISOString(),
  };
}
