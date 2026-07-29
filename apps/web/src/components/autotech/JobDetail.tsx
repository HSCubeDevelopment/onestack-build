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
} from 'lucide-react';
import { api, ApiError, money } from '@/lib/api';
import { AtTopbar, SignOutButton } from '@/components/autotech/kit';

/**
 * Job details for the employee (opened from Car history). Everything a job entails, in the mobile view:
 * the car, status, the saved estimate (with an edit link), photos, tickets on the car, and the notes /
 * activity timeline. Money is withheld by the API (like the car 360) — no quote/invoice figures here.
 */

interface Attachment {
  id: string;
  caption: string | null;
  contentType: string;
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
interface JobDetailData {
  job: {
    id: string;
    reference: string;
    stateName: string;
    assignees: string[];
    siteId: string | null;
    fields: Record<string, unknown>;
    createdAt: string;
    updatedAt: string;
  };
  vehicle: { id: string; label: string; rego: string; fields: Record<string, unknown> } | null;
  notes: NoteItem[];
  photos: Attachment[];
  estimate: EstimateDraft | null;
  tickets: Ticket[];
  moneyHidden: boolean;
}

const TICKET_BADGE: Record<string, string> = {
  open: 'amber',
  paid: 'green',
  disputed: 'purple',
  cancelled: 'gray',
};

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

  const { job, vehicle, notes, photos, estimate, tickets } = data;
  const rego = vehicle?.rego ?? cleanUnknown(vehicle?.fields.rego);
  const line = vehicle ? carLine(vehicle.fields) : '';
  const estTotal =
    estimate && typeof estimate.data.totalAud === 'number' ? estimate.data.totalAud : null;

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

      {/* Estimate */}
      {estimate ? (
        <>
          <div className="at-lbl" style={{ marginTop: 16 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Sparkles size={15} /> Estimate
            </span>
          </div>
          <div className="at-tk">
            {estTotal != null && (
              <div className="hd">
                <div className="ty">Estimated total</div>
                <div className="amt">${Number(estTotal).toFixed(2)}</div>
              </div>
            )}
            {estimate.summary && (
              <div className="mt" style={{ whiteSpace: 'pre-wrap' }}>
                {estimate.summary}
              </div>
            )}
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

      {/* Photos */}
      <div className="at-phase-head" style={{ marginTop: 18 }}>
        <span className="t">Photos</span>
        <span className="c">{photos.length}</span>
      </div>
      {photos.length === 0 ? (
        <div className="at-empty" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <ImageOff size={18} /> No photos on this job yet.
        </div>
      ) : (
        <div className="at-photorow">
          {photos.map((p) => (
            <div key={p.id} className="at-photothumb" title={p.caption ?? 'Photo'}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/backend/vehicle-profile/${vehicle?.id}/photos/${p.id}/content`}
                alt={p.caption ?? 'Photo'}
              />
            </div>
          ))}
        </div>
      )}

      {/* Tickets on the car */}
      {tickets.length > 0 && (
        <>
          <div className="at-phase-head" style={{ marginTop: 18 }}>
            <span className="t">Tickets</span>
            <span className="c">{tickets.length}</span>
          </div>
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

      {/* Notes / activity */}
      <div className="at-phase-head" style={{ marginTop: 18 }}>
        <span className="t">Notes &amp; activity</span>
        <span className="c">{notes.length}</span>
      </div>
      {notes.length === 0 ? (
        <div className="at-empty">Nothing logged on this job yet.</div>
      ) : (
        <div className="at-timeline">
          {notes.map((n, i) => (
            <div key={i} className="at-tlrow note">
              <span className="ic">
                <StickyNote size={18} />
              </span>
              <div className="body">
                <div className="ti" style={{ whiteSpace: 'pre-wrap' }}>
                  {n.body}
                </div>
                <div className="dt">{fmt(n.createdAt)}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Job meta */}
      <div className="at-phase-head" style={{ marginTop: 18 }}>
        <span className="t">Job details</span>
      </div>
      <div className="at-tk">
        <div className="mt">
          <Wrench size={13} style={{ verticalAlign: '-2px', marginRight: 6 }} />
          Reference {job.reference}
        </div>
        {vehicle && (
          <div className="mt">
            <Car size={13} style={{ verticalAlign: '-2px', marginRight: 6 }} />
            {[rego, line].filter(Boolean).join(' · ')}
          </div>
        )}
        {job.assignees.length > 0 && (
          <div className="mt">
            <Users size={13} style={{ verticalAlign: '-2px', marginRight: 6 }} />
            {job.assignees.length} assigned
          </div>
        )}
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
