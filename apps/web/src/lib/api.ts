'use client';

/**
 * Client-side API helper. Everything goes through the same-origin proxy (/api/backend/*), which attaches
 * the auth token server-side. So the browser just talks to its own origin — no tokens, no CORS.
 */
const PREFIX = '/api/backend';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${PREFIX}${path}`, {
    method,
    headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const msg =
      (data && (data.message || data.error)) ||
      `Request failed (${res.status})`;
    throw new ApiError(res.status, Array.isArray(msg) ? msg.join(', ') : String(msg));
  }
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
  del: <T>(path: string) => request<T>('DELETE', path),
};

// ---- Shared API types (mirror the API's view objects) ----

export interface Contact {
  id: string;
  displayName: string;
  email: string | null;
  phone: string | null;
  fields: Record<string, unknown>;
  customFields: Record<string, unknown>;
  createdAt: string;
}

export interface Vehicle {
  id: string;
  type: string;
  label: string;
  fields: Record<string, unknown>;
  customFields: Record<string, unknown>;
  contactId: string | null;
}

export interface WorkItem {
  id: string;
  type: string;
  reference: string;
  stateName: string;
  workflowVersion: number;
  assignees: string[];
  fields: Record<string, unknown>;
  version: number;
  subjects?: Vehicle[];
}

export interface Note {
  id: string;
  workItemId: string;
  authorUserId: string;
  body: string;
  createdAt: string;
}

export interface Attachment {
  id: string;
  workItemId: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  caption: string | null;
  uploadedByUserId: string;
  createdAt: string;
}

export interface QuoteLine {
  id: string;
  description: string;
  type: string;
  quantity: number;
  unitPriceCents: number;
  netCents: number;
  gstCents: number;
  lineTotalCents: number;
}

export interface Quote {
  id: string;
  reference: string;
  status: string;
  workItemId: string;
  revision: number;
  supersedesId: string | null;
  supersededById: string | null;
  subtotalCents: number;
  gstCents: number;
  totalCents: number;
  lines: QuoteLine[];
}

export interface InvoicePortion {
  id: string;
  payerContactId: string | null;
  payerName: string | null;
  description: string;
  amountCents: number;
  paidCents: number;
  balanceCents: number;
}

export interface Payment {
  id: string;
  portionId: string | null;
  amountCents: number;
  method: string;
  receivedAt: string;
}

export interface Invoice {
  id: string;
  reference: string;
  status: string;
  workItemId: string;
  quoteId: string | null;
  payerContactId: string | null;
  dueDate: string | null;
  paidAt: string | null;
  paidBy: string | null;
  subtotalCents: number;
  gstCents: number;
  totalCents: number;
  paidCents: number;
  balanceCents: number;
  paidState: string;
  lines: QuoteLine[];
  portions: InvoicePortion[];
  payments: Payment[];
}

export interface BoardCard {
  id: string;
  reference: string;
  stateName: string;
  customerName: string | null;
  vehicleLabel: string | null;
  assignees: string[];
}

export interface Board {
  type: string;
  columns: { state: string; isFinal: boolean; cards: BoardCard[] }[];
}

export interface DashboardSummary {
  jobsByState: Record<string, number>;
  activeJobs: number;
  totalUnpaidCents: number;
  thisWeekRevenueCents: number;
  weekStart: string;
}

export interface PriceBookItem {
  id: string;
  name: string;
  description: string | null;
  type: string;
  unit: string;
  defaultUnitPriceCents: number;
  code: string | null;
  active: boolean;
}

export interface Lead {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  message: string | null;
  vehicleInfo: string | null;
  source: string;
  status: string;
  convertedContactId: string | null;
  createdAt: string;
}

export interface LeadForm {
  id: string;
  name: string;
  publicToken: string;
  enabled: boolean;
  embedUrl: string;
}

export interface CustomField {
  id: string;
  appliesTo: string;
  key: string;
  label: string;
  type: string;
  required: boolean;
  options: string[];
  archived: boolean;
}

export interface Resource {
  id: string;
  type: string;
  name: string;
}

export interface Booking {
  id: string;
  resourceId: string;
  workItemId: string | null;
  title: string;
  startsAt: string;
  endsAt: string;
  notes: string | null;
}

export const money = (cents: number): string =>
  `$${(cents / 100).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
