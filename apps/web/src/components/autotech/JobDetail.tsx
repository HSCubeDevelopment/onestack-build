'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Wrench,
  Car,
  StickyNote,
  ImageOff,
  Sparkles,
  ReceiptText,
  FileText,
  Pencil,
  MapPin,
  Users,
  User,
  Phone,
  Mail,
  ShieldCheck,
  FileSpreadsheet,
  Lock,
  AlertTriangle,
} from 'lucide-react';
import { api, ApiError, money } from '@/lib/api';
import { parseEstimateNote, type ParsedEstimateNote } from '@/lib/estimate-note';
import { AtTopbar, SignOutButton } from '@/components/autotech/kit';

/**
 * Job details for the employee (opened from Car history) — the same picture the owner's job page shows,
 * in the mobile shell: car(s), customer, status, description, the insurance claim, the saved estimate,
 * photos by category, tickets on the car, quotes/invoices, and the notes timeline.
 *
 * Money is gated SERVER-SIDE by the finance rule (card 40.8): an owner always sees it, a staff member
 * only if the owner granted finance access. When it's withheld the API sends null (not zero) and this
 * page says so plainly rather than implying there's nothing there.
 */

interface Attachment {
  id: string;
  caption: string | null;
  contentType: string;
  createdAt: string;
}
interface NoteItem {
  body: string;
  authorUserId: string;
  createdAt: string;
}
interface EstimateDraft {
  id: string;
  summary: string;
  data: Record<string, unknown>;
  updatedAt: string;
}
interface Ticket {
  id: string;
  noticeType: string;
  noticeNumber: string;
  agency: string;
  offence: string;
  dueDate: string;
  amountDueCents: number;
  status: string;
  hasFile: boolean;
}
interface VehicleRow {
  id: string;
  label: string;
  rego: string;
  fields: Record<string, unknown>;
}
interface QuoteRow {
  id: string;
  reference: string;
  status: string;
  totalCents: number;
}
interface InvoiceRow {
  id: string;
  reference: string;
  status: string;
  totalCents: number;
  paidCents: number;
  balanceCents: number;
}
interface JobDetailData {
  job: {
    id: string;
    reference: string;
    stateName: string;
    assignees: string[];
    siteId: string | null;
    description: string;
    fields: Record<string, unknown>;
    createdAt: string;
    updatedAt: string;
  };
  vehicle: VehicleRow | null;
  vehicles: VehicleRow[];
  customer: { id: string; displayName: string; phone: string | null; email: string | null } | null;
  claim: Record<string, unknown> | null;
  notes: NoteItem[];
  photos: Attachment[];
  estimate: EstimateDraft | null;
  tickets: Ticket[];
  quotes: QuoteRow[] | null;
  invoices: InvoiceRow[] | null;
  moneyHidden: boolean;
}

const TICKET_BADGE: Record<string, string> = {
  open: 'amber',
  paid: 'green',
  disputed: 'purple',
  cancelled: 'gray',
};

/** Photo categories, in capture order — must match PHOTO_CATEGORIES in the API's repair-photos.ts. */
const PHOTO_GROUPS = [
  'Check In',
  'Existing damage',
  'Accident damage',
  'Supplementary damage',
  'Progress',
  'Handover',
  'Uncategorized',
  // Legacy captions from the original Before/During/After flow — still shown where they exist.
  'Before repair',
  'During repair',
  'After repair',
  'Estimate photo',
];

const cleanUnknown = (s: unknown): string => (s === 'Unknown' || !s ? '' : String(s));
const carLine = (f: Record<string, unknown>): string =>
  [f.year, cleanUnknown(f.make), cleanUnknown(f.model)].filter(Boolean).join(' ');

/** Loose status → badge colour: finished states calm, live work highlighted. */
function stateColor(state: string): string {
  const s = state.toLowerCase();
  if (/(collect|closed|complete|done)/.test(s)) return 'green';
  if (/(cancel)/.test(s)) return 'gray';
  if (/(ready|await|hold)/.test(s)) return 'amber';
  return 'blue';
}

const fmt = (iso: string): string =>
  new Date(iso).toLocaleString('en-AU', {
    timeZone: 'Australia/Melbourne',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

/** A labelled value; shows an em-dash rather than a blank so a missing field reads as "not recorded". */
function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="at-field" style={{ margin: 0 }}>
      <div className="at-flabel">{label}</div>
      <div style={{ fontWeight: 700, fontSize: 15 }}>{value || '—'}</div>
    </div>
  );
}

// ---- estimate breakdown: render the saved structured estimate as tables, not a paragraph ----
const asArr = (v: unknown): Record<string, unknown>[] =>
  Array.isArray(v)
    ? (v.filter((x) => x && typeof x === 'object') as Record<string, unknown>[])
    : [];
const n = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const s = (v: unknown): string => (typeof v === 'string' ? v : '');
const aud = (v: number): string =>
  `$${v.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * A saved estimate, itemised. When the stored estimate carries structured lines (fixes / parts / labour)
 * it renders them as tables with a totals block; older saves that only kept a text summary fall back to
 * showing that summary (plus the total if present), so nothing regresses.
 */
function EstimateBreakdown({ data, summary }: { data: Record<string, unknown>; summary: string }) {
  const fixes = asArr(data.fixes);
  const parts = asArr(data.parts);
  const labour = asArr(data.labour);
  const total = n(data.totalAud);
  const structured = fixes.length + parts.length + labour.length > 0;

  if (!structured) {
    return (
      <>
        {summary && (
          <div className="mt" style={{ whiteSpace: 'pre-wrap' }}>
            {summary}
          </div>
        )}
        {total > 0 && (
          <div className="at-esttotals">
            <div className="row grand">
              <span>Estimated total</span>
              <span>{aud(total)}</span>
            </div>
          </div>
        )}
      </>
    );
  }

  const rate = n(data.labourRateAud);
  const rows: [string, number][] = [
    ['Parts', n(data.partsSubtotalAud)],
    ['Labour', n(data.labourSubtotalAud)],
    ['Materials', n(data.materialsAud)],
    ['Subtotal', n(data.subtotalAud)],
    ['GST', n(data.gstAud)],
  ];

  return (
    <>
      {fixes.length > 0 && (
        <>
          <div className="at-estsub">What needs fixing</div>
          <table className="at-tbl">
            <thead>
              <tr>
                <th>Panel</th>
                <th>Operation</th>
              </tr>
            </thead>
            <tbody>
              {fixes.map((f, i) => (
                <tr key={i}>
                  <td>
                    {s(f.panel) || 'Panel'}
                    {s(f.note) && <span style={{ color: 'var(--at-label2)' }}> — {s(f.note)}</span>}
                  </td>
                  <td style={{ textTransform: 'capitalize' }}>{s(f.operation)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {parts.length > 0 && (
        <>
          <div className="at-estsub">Parts</div>
          <table className="at-tbl">
            <thead>
              <tr>
                <th>Part</th>
                <th className="num">Qty</th>
                <th className="num">Unit</th>
                <th className="num">Total</th>
              </tr>
            </thead>
            <tbody>
              {parts.map((p, i) => {
                const qty = n(p.quantity) || 1;
                const unit = n(p.unitPriceAud);
                return (
                  <tr key={i}>
                    <td>{s(p.name) || 'Part'}</td>
                    <td className="num">{qty}</td>
                    <td className="num">{aud(unit)}</td>
                    <td className="num">{aud(qty * unit)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}

      {labour.length > 0 && (
        <>
          <div className="at-estsub">Labour{rate ? ` · ${aud(rate)}/h` : ''}</div>
          <table className="at-tbl">
            <thead>
              <tr>
                <th>Task</th>
                <th className="num">Hours</th>
                <th className="num">Cost</th>
              </tr>
            </thead>
            <tbody>
              {labour.map((l, i) => {
                const hours = n(l.hours);
                return (
                  <tr key={i}>
                    <td style={{ textTransform: 'capitalize' }}>{s(l.task) || 'Labour'}</td>
                    <td className="num">{hours}</td>
                    <td className="num">{rate ? aud(hours * rate) : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}

      <div className="at-esttotals">
        {rows
          .filter(([, v]) => v > 0)
          .map(([label, v]) => (
            <div key={label} className="row">
              <span>{label}</span>
              <span>{aud(v)}</span>
            </div>
          ))}
        <div className="row grand">
          <span>Estimated total</span>
          <span>{aud(total || n(data.subtotalAud))}</span>
        </div>
      </div>
    </>
  );
}

/**
 * An estimate note (the human-readable summary written to the job's timeline) rendered as tables. This is
 * what a saved estimate looks like in "Notes & activity" — previously a 1,600-character paragraph. Parsed
 * from the text we generated when saving, so it works for estimates saved before the structured store.
 */
function EstimateNoteTables({ parsed }: { parsed: ParsedEstimateNote }) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontWeight: 800 }}>
        <span>AI estimate (draft)</span>
        {parsed.total && <span>{parsed.total}</span>}
      </div>
      {parsed.summary && (
        <div className="dt" style={{ marginTop: 4 }}>
          {parsed.summary}
        </div>
      )}

      {parsed.fixes.length > 0 && (
        <>
          <div className="at-estsub">What needs fixing</div>
          <table className="at-tbl">
            <thead>
              <tr>
                <th>Panel</th>
                <th>Operation</th>
              </tr>
            </thead>
            <tbody>
              {parsed.fixes.map((f, i) => (
                <tr key={i}>
                  <td>
                    {f.panel}
                    {f.note && <span style={{ color: 'var(--at-label2)' }}> — {f.note}</span>}
                  </td>
                  <td style={{ textTransform: 'capitalize' }}>{f.operation}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {parsed.parts.length > 0 && (
        <>
          <div className="at-estsub">Parts</div>
          <table className="at-tbl">
            <thead>
              <tr>
                <th>Part</th>
                <th className="num">Qty</th>
                <th className="num">Unit</th>
              </tr>
            </thead>
            <tbody>
              {parsed.parts.map((p, i) => (
                <tr key={i}>
                  <td>{p.name}</td>
                  <td className="num">{p.quantity}</td>
                  <td className="num">{p.unitPrice || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {parsed.labour.length > 0 && (
        <>
          <div className="at-estsub">Labour</div>
          <table className="at-tbl">
            <thead>
              <tr>
                <th>Task</th>
                <th className="num">Hours</th>
              </tr>
            </thead>
            <tbody>
              {parsed.labour.map((l, i) => (
                <tr key={i}>
                  <td style={{ textTransform: 'capitalize' }}>{l.task}</td>
                  <td className="num">{l.hours || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {parsed.totals.length > 0 && (
        <div className="at-esttotals">
          {parsed.totals.map(([label, value], i) => (
            <div key={i} className={`row${/estimated total/i.test(label) ? ' grand' : ''}`}>
              <span>{label}</span>
              <span>{value}</span>
            </div>
          ))}
        </div>
      )}

      {parsed.flags.map((f, i) => (
        <div key={i} className="at-flag warn" style={{ marginTop: 8 }}>
          <AlertTriangle size={14} strokeWidth={2.4} />
          <span>{f}</span>
        </div>
      ))}
    </div>
  );
}

function SectionHead({ title, count }: { title: string; count?: number }) {
  return (
    <div className="at-phase-head" style={{ marginTop: 18 }}>
      <span className="t">{title}</span>
      {count != null && <span className="c">{count}</span>}
    </div>
  );
}

export function JobDetail({ jobId }: { jobId: string }) {
  const [data, setData] = useState<JobDetailData | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<JobDetailData>(`/vehicle-profile/jobs/${jobId}`)
      .then(setData)
      .catch((e) => setErr(e instanceof ApiError ? e.message : 'Could not load this job.'));
  }, [jobId]);

  if (err) {
    return (
      <>
        <AtTopbar backHref="/inout/car-history" right={<SignOutButton />} />
        <div className="at-errbanner" style={{ marginTop: 12 }}>
          {err}
        </div>
      </>
    );
  }
  if (!data) {
    return (
      <>
        <AtTopbar backHref="/inout/car-history" right={<SignOutButton />} />
        <div className="at-spin">Loading…</div>
      </>
    );
  }

  const { job, vehicle, vehicles, customer, claim, notes, photos, estimate, tickets } = data;
  const { quotes, invoices, moneyHidden } = data;
  const rego = vehicle?.rego ?? '';
  const line = vehicle ? carLine(vehicle.fields) : '';

  // Claim-file readiness mirrors the owner's overview. Two of its four checks are quotes/invoices, so
  // it's only shown when money is visible — a part-blind percentage would be worse than none.
  const readiness = moneyHidden
    ? null
    : (() => {
        const items = [
          { label: 'Claim details recorded', done: !!claim },
          { label: 'Damage photos (3+)', done: photos.length >= 3 },
          { label: 'Quote prepared', done: (quotes?.length ?? 0) >= 1 },
          { label: 'Invoice raised', done: (invoices?.length ?? 0) >= 1 },
        ];
        const done = items.filter((i) => i.done).length;
        return {
          pct: Math.round((done / items.length) * 100),
          missing: items.filter((i) => !i.done),
        };
      })();

  // Group photos by their category caption; anything unrecognised falls into "Other".
  const grouped = PHOTO_GROUPS.map((g) => ({
    title: g,
    shots: photos.filter((p) => p.caption === g),
  })).filter((g) => g.shots.length > 0);
  const otherShots = photos.filter((p) => !PHOTO_GROUPS.includes(p.caption ?? ''));
  if (otherShots.length) grouped.push({ title: 'Other', shots: otherShots });

  return (
    <>
      <AtTopbar backHref="/inout/car-history" right={<SignOutButton />} />

      <div className="at-carhead">
        <div className="at-carrego">{rego || job.reference}</div>
        <div className="at-carsub" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>
            Job {job.reference}
            {line ? ` · ${line}` : ''}
          </span>
          <span className={`at-badge ${stateColor(job.stateName)}`}>{job.stateName}</span>
        </div>
      </div>

      {customer && (
        <div className="at-tk" style={{ marginTop: 12 }}>
          <div className="ty">
            <User size={14} style={{ verticalAlign: '-2px', marginRight: 5 }} />
            {customer.displayName}
          </div>
          {customer.phone && (
            <a className="mt" href={`tel:${customer.phone}`} style={{ color: 'inherit' }}>
              <Phone size={13} style={{ verticalAlign: '-2px', marginRight: 6 }} />
              {customer.phone}
            </a>
          )}
          {customer.email && (
            <div className="mt">
              <Mail size={13} style={{ verticalAlign: '-2px', marginRight: 6 }} />
              {customer.email}
            </div>
          )}
        </div>
      )}

      {job.description && (
        <>
          <SectionHead title="Description" />
          <div className="at-tk">
            <div className="mt" style={{ whiteSpace: 'pre-wrap' }}>
              {job.description}
            </div>
          </div>
        </>
      )}

      {/* Claim-file readiness — only when the full picture (incl. quotes/invoices) is visible. */}
      {readiness && (
        <>
          <SectionHead title="Claim file" />
          <div className="at-tk">
            <div className="hd">
              <div className="ty">{readiness.pct}% ready</div>
            </div>
            <div className="mt">
              {readiness.missing.length === 0
                ? 'Everything a claim pack needs is present.'
                : `Missing: ${readiness.missing.map((m) => m.label).join(' · ')}`}
            </div>
          </div>
        </>
      )}

      {/* Estimate */}
      {estimate ? (
        <>
          <SectionHead title="Estimate" />
          <div className="at-tk">
            <EstimateBreakdown data={estimate.data} summary={estimate.summary} />
            <div className="act">
              {rego && (
                <Link
                  className="at-chip on"
                  href={`/inout/estimate?rego=${encodeURIComponent(rego)}`}
                >
                  <Pencil size={14} /> Edit estimate
                </Link>
              )}
            </div>
          </div>
        </>
      ) : (
        rego && (
          <Link
            href={`/inout/estimate?rego=${encodeURIComponent(rego)}`}
            className="at-btn ghost"
            style={{ marginTop: 14, display: 'inline-flex', width: 'auto' }}
          >
            <Sparkles size={16} /> New estimate
          </Link>
        )
      )}

      {/* Quotes & invoices — the money surface, shown only to someone allowed to see it. */}
      {moneyHidden ? (
        <>
          <SectionHead title="Quotes & invoices" />
          <div className="at-empty" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Lock size={16} /> Hidden — ask the owner for finance access.
          </div>
        </>
      ) : (
        <>
          <SectionHead title="Quotes" count={quotes?.length ?? 0} />
          {(quotes?.length ?? 0) === 0 ? (
            <div className="at-empty">No quotes on this job.</div>
          ) : (
            quotes!.map((q) => (
              <div key={q.id} className="at-tk">
                <div className="hd">
                  <div className="ty">
                    <FileSpreadsheet size={14} style={{ verticalAlign: '-2px', marginRight: 5 }} />
                    {q.reference}
                  </div>
                  <div style={{ textAlign: 'right', display: 'grid', gap: 5, justifyItems: 'end' }}>
                    <div className="amt">{money(q.totalCents)}</div>
                    <span className="at-badge gray">{q.status}</span>
                  </div>
                </div>
              </div>
            ))
          )}

          <SectionHead title="Invoices" count={invoices?.length ?? 0} />
          {(invoices?.length ?? 0) === 0 ? (
            <div className="at-empty">No invoices on this job.</div>
          ) : (
            invoices!.map((i) => (
              <div key={i.id} className="at-tk">
                <div className="hd">
                  <div className="ty">
                    <ReceiptText size={14} style={{ verticalAlign: '-2px', marginRight: 5 }} />
                    {i.reference}
                  </div>
                  <div style={{ textAlign: 'right', display: 'grid', gap: 5, justifyItems: 'end' }}>
                    <div className="amt">{money(i.totalCents)}</div>
                    <span className={`at-badge ${i.balanceCents === 0 ? 'green' : 'amber'}`}>
                      {i.status}
                    </span>
                  </div>
                </div>
                <div className="mt">
                  Paid {money(i.paidCents)} · Balance {money(i.balanceCents)}
                </div>
              </div>
            ))
          )}
        </>
      )}

      {/* Insurance claim */}
      {claim && (
        <>
          <SectionHead title="Insurance claim" />
          <div className="at-tk">
            <div className="at-grid2">
              <Field label="Insurer" value={claim.insurer as string} />
              <Field label="Claim number" value={claim.claimNumber as string} />
              <Field label="Assessor" value={claim.assessor as string} />
              <Field label="Date lodged" value={claim.dateLodged as string} />
              {!moneyHidden && (
                <>
                  <Field
                    label="Authorised amount"
                    value={
                      typeof claim.authorisedAmountCents === 'number'
                        ? money(claim.authorisedAmountCents)
                        : undefined
                    }
                  />
                  <Field
                    label="Excess"
                    value={
                      typeof claim.excessCents === 'number' ? money(claim.excessCents) : undefined
                    }
                  />
                </>
              )}
            </div>
            {moneyHidden && (
              <div className="mt" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <Lock size={13} /> Amounts hidden.
              </div>
            )}
          </div>
        </>
      )}

      {/* Photos, grouped by capture category */}
      <SectionHead title="Photos" count={photos.length} />
      {photos.length === 0 ? (
        <div className="at-empty" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <ImageOff size={18} /> No photos on this job yet.
        </div>
      ) : (
        grouped.map((g) => (
          <div key={g.title} className="at-phase">
            <div className="at-phase-head">
              <span className="t">{g.title}</span>
              <span className="c">{g.shots.length}</span>
            </div>
            <div className="at-photorow">
              {g.shots.map((p) => (
                <div key={p.id} className="at-photothumb" title={p.caption ?? 'Photo'}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/backend/vehicle-profile/${vehicle?.id}/photos/${p.id}/content`}
                    alt={p.caption ?? 'Photo'}
                  />
                </div>
              ))}
            </div>
          </div>
        ))
      )}

      {/* Tickets on the car */}
      {tickets.length > 0 && (
        <>
          <SectionHead title="Tickets" count={tickets.length} />
          {tickets.map((t) => (
            <div key={t.id} className="at-tk">
              <div className="hd">
                <div>
                  <div className="ty">
                    <ReceiptText size={14} style={{ verticalAlign: '-2px', marginRight: 4 }} />
                    {t.noticeType || 'Ticket'}
                    {t.noticeNumber ? ` · ${t.noticeNumber}` : ''}
                  </div>
                  {(t.agency || t.offence) && (
                    <div className="mt">{[t.agency, t.offence].filter(Boolean).join(' — ')}</div>
                  )}
                  {t.dueDate && <div className="mt">Due {t.dueDate}</div>}
                </div>
                <div style={{ textAlign: 'right', display: 'grid', gap: 5, justifyItems: 'end' }}>
                  {t.amountDueCents > 0 && <div className="amt">{money(t.amountDueCents)}</div>}
                  <span className={`at-badge ${TICKET_BADGE[t.status] ?? 'gray'}`}>{t.status}</span>
                </div>
              </div>
              {t.hasFile && (
                <div className="act">
                  <a
                    className="at-chip"
                    href={`/api/backend/tickets/${t.id}/file`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <FileText size={14} /> View notice
                  </a>
                </div>
              )}
            </div>
          ))}
        </>
      )}

      {/* Vehicles */}
      <SectionHead title={vehicles.length === 1 ? 'Vehicle' : 'Vehicles'} count={vehicles.length} />
      {vehicles.length === 0 ? (
        <div className="at-empty">No vehicle attached.</div>
      ) : (
        vehicles.map((v) => (
          <div key={v.id} className="at-tk">
            <div className="at-grid2">
              <Field label="Rego" value={v.rego} />
              <Field
                label="Year"
                value={v.fields.year != null ? String(v.fields.year) : undefined}
              />
              <Field label="Make" value={cleanUnknown(v.fields.make)} />
              <Field label="Model" value={cleanUnknown(v.fields.model)} />
              {v.fields.vin ? <Field label="VIN" value={String(v.fields.vin)} /> : null}
              {v.fields.colour ? <Field label="Colour" value={String(v.fields.colour)} /> : null}
            </div>
          </div>
        ))
      )}

      {/* Notes / activity */}
      <SectionHead title="Notes &amp; activity" count={notes.length} />
      {notes.length === 0 ? (
        <div className="at-empty">Nothing logged on this job yet.</div>
      ) : (
        <div className="at-timeline">
          {notes.map((note, i) => {
            // A saved estimate becomes a table; every other note stays plain text.
            const parsed = parseEstimateNote(note.body);
            return (
              <div key={i} className="at-tlrow note" style={{ alignItems: 'flex-start' }}>
                <span className="ic">
                  {parsed ? <Sparkles size={18} /> : <StickyNote size={18} />}
                </span>
                <div className="body" style={{ flex: 1 }}>
                  {parsed ? (
                    <EstimateNoteTables parsed={parsed} />
                  ) : (
                    <div className="ti" style={{ whiteSpace: 'pre-wrap' }}>
                      {note.body}
                    </div>
                  )}
                  <div className="dt">{fmt(note.createdAt)}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Job meta */}
      <SectionHead title="Job details" />
      <div className="at-tk">
        <div className="mt">
          <Wrench size={13} style={{ verticalAlign: '-2px', marginRight: 6 }} />
          Reference {job.reference}
        </div>
        <div className="mt">
          <ShieldCheck size={13} style={{ verticalAlign: '-2px', marginRight: 6 }} />
          Status {job.stateName}
        </div>
        {vehicle && (
          <div className="mt">
            <Car size={13} style={{ verticalAlign: '-2px', marginRight: 6 }} />
            {[rego, line].filter(Boolean).join(' · ')}
          </div>
        )}
        <div className="mt">
          <Users size={13} style={{ verticalAlign: '-2px', marginRight: 6 }} />
          {job.assignees.length} assigned
        </div>
        {job.siteId && (
          <div className="mt">
            <MapPin size={13} style={{ verticalAlign: '-2px', marginRight: 6 }} />
            Site set
          </div>
        )}
        <div className="mt">Opened {fmt(job.createdAt)}</div>
        <div className="mt">Updated {fmt(job.updatedAt)}</div>
      </div>
    </>
  );
}
