'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  api,
  Attachment,
  Contact,
  Invoice,
  InvoicePortion,
  money,
  Note,
  Quote,
  Vehicle,
  WorkItem,
} from '@/lib/api';
import {
  EmptyState,
  ErrorBanner,
  Loading,
  Modal,
  PageHead,
  StatusBadge,
  useAsync,
} from '@/components/ui';
import {
  ClaimFileTab,
  EstimateTab,
  FloorOrdersTab,
  SupplierInvoicesTab,
} from '@/components/job/Phase2Tabs';

const EVENTS: Record<string, { event: string; label: string }[]> = {
  Booked: [{ event: 'START', label: 'Start work' }],
  InProgress: [
    { event: 'AWAIT_PARTS', label: 'Await parts' },
    { event: 'READY', label: 'Mark ready' },
  ],
  AwaitingParts: [{ event: 'RESUME', label: 'Resume' }],
  Ready: [{ event: 'COLLECT', label: 'Mark collected' }],
  Collected: [],
};

type Tab =
  | 'overview'
  | 'estimate'
  | 'quotes'
  | 'invoices'
  | 'claim'
  | 'floor'
  | 'supplier'
  | 'notes'
  | 'photos';

const TAB_LABELS: Record<Tab, string> = {
  overview: 'Overview',
  estimate: 'AI estimate',
  quotes: 'Quotes',
  invoices: 'Invoices',
  claim: 'Claim file',
  floor: 'Floor orders',
  supplier: 'Supplier invoices',
  notes: 'Notes',
  photos: 'Photos',
};

export default function JobDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data, loading, error, reload } = useAsync(
    () =>
      Promise.all([
        api.get<WorkItem>(`/work-items/${id}`),
        api.get<Quote[]>(`/work-items/${id}/quotes`),
        api.get<Invoice[]>(`/work-items/${id}/invoices`),
        api.get<Note[]>(`/work-items/${id}/notes`),
        api.get<Attachment[]>(`/work-items/${id}/attachments`),
        api.get<Contact[]>('/contacts'),
      ]),
    [id],
  );
  const [tab, setTab] = useState<Tab>('overview');
  const [userId, setUserId] = useState<string | null>(null);
  const [actionErr, setActionErr] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/me')
      .then((r) => r.json())
      .then((d: { userId: string }) => setUserId(d.userId))
      .catch(() => setUserId(null));
  }, []);

  return (
    <>
      <div style={{ marginBottom: 14 }}>
        <Link href="/jobs" className="link-btn">
          ← Back to jobs
        </Link>
      </div>
      <ErrorBanner message={error} />
      {loading && <Loading />}
      {data && (
        <JobDetail
          job={data[0]}
          quotes={data[1]}
          invoices={data[2]}
          notes={data[3]}
          attachments={data[4]}
          contacts={data[5]}
          jobId={id}
          userId={userId}
          tab={tab}
          setTab={setTab}
          reload={reload}
          actionErr={actionErr}
          setActionErr={setActionErr}
        />
      )}
    </>
  );
}

function JobDetail({
  job,
  quotes,
  invoices,
  notes,
  attachments,
  contacts,
  jobId,
  userId,
  tab,
  setTab,
  reload,
  actionErr,
  setActionErr,
}: {
  job: WorkItem;
  quotes: Quote[];
  invoices: Invoice[];
  notes: Note[];
  attachments: Attachment[];
  contacts: Contact[];
  jobId: string;
  userId: string | null;
  tab: Tab;
  setTab: (t: Tab) => void;
  reload: () => Promise<unknown>;
  actionErr: string | null;
  setActionErr: (s: string | null) => void;
}) {
  const contactName = (id: unknown): string =>
    contacts.find((c) => c.id === id)?.displayName ?? '—';
  const customerName = contactName(job.fields.customerId);
  const subjects = job.subjects ?? [];
  const vehicleLabels = subjects.map((v) => v.label).join(', ');
  const events = EVENTS[job.stateName] ?? [];
  const assigned = userId ? job.assignees.includes(userId) : false;

  async function act(fn: () => Promise<unknown>) {
    setActionErr(null);
    try {
      await fn();
      await reload();
    } catch (e) {
      setActionErr(e instanceof Error ? e.message : String(e));
    }
  }

  const transition = (event: string) =>
    act(() => api.post(`/work-items/${jobId}/transition`, { event }));
  const assignMe = () =>
    act(() => api.post(`/work-items/${jobId}/assign`, { assignees: [userId] }));
  const unassign = () => act(() => api.post(`/work-items/${jobId}/assign`, { assignees: [] }));

  return (
    <>
      <PageHead title={job.reference}>
        {events.map((ev) => (
          <button key={ev.event} className="btn primary" onClick={() => void transition(ev.event)}>
            {ev.label}
          </button>
        ))}
      </PageHead>

      <div className="card" style={{ marginBottom: 18 }}>
        <div className="row wrap">
          <StatusBadge status={job.stateName} />
          <span className="muted">{customerName}</span>
          {vehicleLabels && <span className="faint">· {vehicleLabels}</span>}
          <div className="spacer" />
          <span className="faint">
            {job.assignees.length} assignee{job.assignees.length === 1 ? '' : 's'}
          </span>
          {userId &&
            (assigned ? (
              <button className="btn sm" onClick={() => void unassign()}>
                Unassign
              </button>
            ) : (
              <button className="btn sm" onClick={() => void assignMe()}>
                Assign me
              </button>
            ))}
        </div>
      </div>

      <ErrorBanner message={actionErr} />

      <div className="tabs">
        {(
          [
            'overview',
            'estimate',
            'quotes',
            'invoices',
            'claim',
            'floor',
            'supplier',
            'notes',
            'photos',
          ] as Tab[]
        ).map((t) => (
          <div key={t} className={`tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
            {TAB_LABELS[t]}
          </div>
        ))}
      </div>

      {tab === 'overview' && (
        <OverviewTab job={job} subjects={subjects} contactName={contactName} />
      )}
      {tab === 'estimate' && (
        <EstimateTab jobId={jobId} reloadJob={reload} setTab={(t) => setTab(t as Tab)} />
      )}
      {tab === 'claim' && <ClaimFileTab jobId={jobId} />}
      {tab === 'floor' && <FloorOrdersTab jobId={jobId} />}
      {tab === 'supplier' && <SupplierInvoicesTab jobId={jobId} />}
      {tab === 'quotes' && <QuotesTab quotes={quotes} jobId={jobId} act={act} setTab={setTab} />}
      {tab === 'invoices' && (
        <InvoicesTab
          invoices={invoices}
          jobId={jobId}
          contacts={contacts}
          contactName={contactName}
          act={act}
        />
      )}
      {tab === 'notes' && <NotesTab notes={notes} jobId={jobId} act={act} />}
      {tab === 'photos' && (
        <PhotosTab attachments={attachments} jobId={jobId} act={act} setActionErr={setActionErr} />
      )}
    </>
  );
}

/* ---------------- Overview ---------------- */

function OverviewTab({
  job,
  subjects,
  contactName,
}: {
  job: WorkItem;
  subjects: Vehicle[];
  contactName: (id: unknown) => string;
}) {
  const claim = job.fields.claim as Record<string, unknown> | undefined;
  const description = (job.fields.description as string) || '';

  return (
    <div className="stack">
      <div className="card">
        <h3 style={{ marginBottom: 10 }}>Description</h3>
        {description ? <p>{description}</p> : <span className="faint">No description.</span>}
      </div>

      {claim && (
        <div className="card">
          <h3 style={{ marginBottom: 10 }}>Insurance claim</h3>
          <div className="grid cols-2" style={{ gap: 10 }}>
            <Field label="Insurer" value={claim.insurer as string} />
            <Field label="Claim number" value={claim.claimNumber as string} />
            <Field label="Assessor" value={claim.assessor as string} />
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
              value={typeof claim.excessCents === 'number' ? money(claim.excessCents) : undefined}
            />
            <Field
              label="Bill payer"
              value={
                claim.billPayer
                  ? contactName(claim.billPayer) !== '—'
                    ? contactName(claim.billPayer)
                    : (claim.billPayer as string)
                  : undefined
              }
            />
          </div>
        </div>
      )}

      <div className="card">
        <h3 style={{ marginBottom: 10 }}>Vehicle{subjects.length === 1 ? '' : 's'}</h3>
        {subjects.length === 0 ? (
          <span className="faint">No vehicle attached.</span>
        ) : (
          <div className="stack" style={{ gap: 14 }}>
            {subjects.map((v) => (
              <div key={v.id} className="grid cols-4" style={{ gap: 10 }}>
                <Field label="Rego" value={v.fields.rego as string} />
                <Field label="Make" value={v.fields.make as string} />
                <Field label="Model" value={v.fields.model as string} />
                <Field
                  label="Year"
                  value={v.fields.year != null ? String(v.fields.year) : undefined}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value?: string }) {
  return (
    <div className="kpi" style={{ gap: 3 }}>
      <span className="label">{label}</span>
      <span>{value || <span className="faint">—</span>}</span>
    </div>
  );
}

/* ---------------- Quotes ---------------- */

function LinesTable({
  lines,
  subtotalCents,
  gstCents,
  totalCents,
  onDelete,
}: {
  lines: {
    id: string;
    description: string;
    quantity: number;
    unitPriceCents: number;
    lineTotalCents: number;
  }[];
  subtotalCents: number;
  gstCents: number;
  totalCents: number;
  onDelete?: (lineId: string) => void;
}) {
  return (
    <table className="table" style={{ marginTop: 6 }}>
      <thead>
        <tr>
          <th>Description</th>
          <th className="right">Qty</th>
          <th className="right">Unit</th>
          <th className="right">Total</th>
          {onDelete && <th />}
        </tr>
      </thead>
      <tbody>
        {lines.length === 0 ? (
          <tr>
            <td colSpan={onDelete ? 5 : 4} className="faint">
              No lines yet.
            </td>
          </tr>
        ) : (
          lines.map((l) => (
            <tr key={l.id}>
              <td>{l.description}</td>
              <td className="right">{l.quantity}</td>
              <td className="right">{money(l.unitPriceCents)}</td>
              <td className="right">{money(l.lineTotalCents)}</td>
              {onDelete && (
                <td className="right">
                  <button className="btn danger sm" onClick={() => onDelete(l.id)}>
                    Delete
                  </button>
                </td>
              )}
            </tr>
          ))
        )}
      </tbody>
      <tfoot>
        <tr>
          <td colSpan={onDelete ? 4 : 3} className="right muted">
            Subtotal
          </td>
          <td className="right">{money(subtotalCents)}</td>
          {onDelete && <td />}
        </tr>
        <tr>
          <td colSpan={onDelete ? 4 : 3} className="right muted">
            GST
          </td>
          <td className="right">{money(gstCents)}</td>
          {onDelete && <td />}
        </tr>
        <tr>
          <td colSpan={onDelete ? 4 : 3} className="right">
            <strong>Total</strong>
          </td>
          <td className="right">
            <strong>{money(totalCents)}</strong>
          </td>
          {onDelete && <td />}
        </tr>
      </tfoot>
    </table>
  );
}

function QuotesTab({
  quotes,
  jobId,
  act,
  setTab,
}: {
  quotes: Quote[];
  jobId: string;
  act: (fn: () => Promise<unknown>) => Promise<void>;
  setTab: (t: Tab) => void;
}) {
  const [lineFor, setLineFor] = useState<string | null>(null);

  return (
    <div className="stack">
      <div className="row">
        <div className="spacer" />
        <button
          className="btn primary"
          onClick={() => void act(() => api.post(`/work-items/${jobId}/quotes`))}
        >
          + New quote
        </button>
      </div>

      {quotes.length === 0 ? (
        <div className="card">
          <EmptyState>No quotes yet.</EmptyState>
        </div>
      ) : (
        quotes.map((q) => {
          const isDraft = q.status === 'Draft';
          return (
            <div key={q.id} className="card">
              <div className="row wrap" style={{ marginBottom: 8 }}>
                <span className="mono">{q.reference}</span>
                {q.revision > 1 && <span className="faint">r{q.revision}</span>}
                <StatusBadge status={q.status} />
                {q.supersededById && <span className="faint">· superseded</span>}
                {q.supersedesId && <span className="faint">· supersedes earlier</span>}
                <div className="spacer" />
                {isDraft && (
                  <button className="btn sm" onClick={() => setLineFor(q.id)}>
                    + Add line
                  </button>
                )}
                {isDraft && (
                  <button
                    className="btn sm"
                    onClick={() =>
                      void act(() => api.post(`/quotes/${q.id}/status`, { status: 'Sent' }))
                    }
                  >
                    Send
                  </button>
                )}
                {q.status === 'Sent' && (
                  <>
                    <button
                      className="btn sm"
                      onClick={() =>
                        void act(() => api.post(`/quotes/${q.id}/status`, { status: 'Accepted' }))
                      }
                    >
                      Accept
                    </button>
                    <button
                      className="btn sm"
                      onClick={() =>
                        void act(() => api.post(`/quotes/${q.id}/status`, { status: 'Declined' }))
                      }
                    >
                      Decline
                    </button>
                  </>
                )}
                {!isDraft && (
                  <button
                    className="btn sm"
                    onClick={() => void act(() => api.post(`/quotes/${q.id}/revise`))}
                  >
                    Revise
                  </button>
                )}
                {q.status === 'Accepted' && (
                  <button
                    className="btn primary sm"
                    onClick={() =>
                      void act(async () => {
                        await api.post(`/quotes/${q.id}/invoice`, {});
                        setTab('invoices');
                      })
                    }
                  >
                    Create invoice
                  </button>
                )}
              </div>
              <LinesTable
                lines={q.lines}
                subtotalCents={q.subtotalCents}
                gstCents={q.gstCents}
                totalCents={q.totalCents}
                onDelete={
                  isDraft
                    ? (lineId) => void act(() => api.del(`/quotes/${q.id}/lines/${lineId}`))
                    : undefined
                }
              />
            </div>
          );
        })
      )}

      {lineFor && (
        <AddLineModal
          title="Add quote line"
          onClose={() => setLineFor(null)}
          onSubmit={async (line) => {
            await act(() => api.post(`/quotes/${lineFor}/lines`, line));
            setLineFor(null);
          }}
        />
      )}
    </div>
  );
}

function AddLineModal({
  title,
  onClose,
  onSubmit,
}: {
  title: string;
  onClose: () => void;
  onSubmit: (line: {
    description: string;
    type: string;
    quantity: number;
    unitPriceCents: number;
  }) => Promise<void>;
}) {
  const [description, setDescription] = useState('');
  const [type, setType] = useState<'labour' | 'part'>('labour');
  const [quantity, setQuantity] = useState('1');
  const [unitPrice, setUnitPrice] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setErr(null);
    setSaving(true);
    try {
      await onSubmit({
        description,
        type,
        quantity: parseFloat(quantity) || 0,
        unitPriceCents: Math.round(parseFloat(unitPrice) * 100),
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  }

  const canSubmit = !!description && !!quantity && unitPrice !== '' && !saving;

  return (
    <Modal title={title} onClose={onClose}>
      <div className="stack">
        <ErrorBanner message={err} />
        <label className="field">
          Description
          <input
            className="input"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
        <div className="grid cols-3">
          <label className="field">
            Type
            <select
              className="select"
              value={type}
              onChange={(e) => setType(e.target.value as 'labour' | 'part')}
            >
              <option value="labour">Labour</option>
              <option value="part">Part</option>
            </select>
          </label>
          <label className="field">
            Quantity
            <input
              className="input"
              type="number"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
          </label>
          <label className="field">
            Unit price ($)
            <input
              className="input"
              type="number"
              value={unitPrice}
              onChange={(e) => setUnitPrice(e.target.value)}
            />
          </label>
        </div>
        <div className="row">
          <div className="spacer" />
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={!canSubmit} onClick={() => void submit()}>
            {saving ? 'Adding…' : 'Add line'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

/* ---------------- Invoices ---------------- */

function InvoicesTab({
  invoices,
  jobId,
  contacts,
  contactName,
  act,
}: {
  invoices: Invoice[];
  jobId: string;
  contacts: Contact[];
  contactName: (id: unknown) => string;
  act: (fn: () => Promise<unknown>) => Promise<void>;
}) {
  const [lineFor, setLineFor] = useState<string | null>(null);
  const [payerFor, setPayerFor] = useState<Invoice | null>(null);
  const [splitFor, setSplitFor] = useState<Invoice | null>(null);
  const [payFor, setPayFor] = useState<Invoice | null>(null);

  return (
    <div className="stack">
      <div className="row">
        <div className="spacer" />
        <button
          className="btn primary"
          onClick={() => void act(() => api.post(`/work-items/${jobId}/invoices`, {}))}
        >
          + New invoice
        </button>
      </div>

      {invoices.length === 0 ? (
        <div className="card">
          <EmptyState>
            No invoices yet. Invoices are usually created from an accepted quote.
          </EmptyState>
        </div>
      ) : (
        invoices.map((inv) => {
          const unpaid = inv.status === 'Unpaid';
          return (
            <div key={inv.id} className="card">
              <div className="row wrap" style={{ marginBottom: 8 }}>
                <span className="mono">{inv.reference}</span>
                <StatusBadge status={inv.status} />
                <StatusBadge status={inv.paidState} />
                <div className="spacer" />
                {unpaid && (
                  <button className="btn sm" onClick={() => setLineFor(inv.id)}>
                    + Add line
                  </button>
                )}
                <button className="btn sm" onClick={() => setPayerFor(inv)}>
                  Set payer
                </button>
                <button className="btn sm" onClick={() => setSplitFor(inv)}>
                  Insurer / excess split
                </button>
                <button className="btn sm" onClick={() => setPayFor(inv)}>
                  Record payment
                </button>
                {unpaid && (
                  <button
                    className="btn sm"
                    onClick={() => void act(() => api.post(`/invoices/${inv.id}/send`))}
                  >
                    Send
                  </button>
                )}
                {inv.status !== 'Paid' && inv.status !== 'Void' && (
                  <button
                    className="btn sm"
                    onClick={() => void act(() => api.post(`/invoices/${inv.id}/mark-paid`))}
                  >
                    Mark paid
                  </button>
                )}
                {inv.status !== 'Void' && (
                  <button
                    className="btn danger sm"
                    onClick={() => void act(() => api.post(`/invoices/${inv.id}/void`))}
                  >
                    Void
                  </button>
                )}
              </div>

              {inv.payerContactId && (
                <div className="faint" style={{ marginBottom: 4 }}>
                  Payer: {contactName(inv.payerContactId)}
                </div>
              )}

              <LinesTable
                lines={inv.lines}
                subtotalCents={inv.subtotalCents}
                gstCents={inv.gstCents}
                totalCents={inv.totalCents}
                onDelete={
                  unpaid
                    ? (lineId) => void act(() => api.del(`/invoices/${inv.id}/lines/${lineId}`))
                    : undefined
                }
              />

              <div className="row" style={{ marginTop: 8 }}>
                <span className="muted">Paid {money(inv.paidCents)}</span>
                <div className="spacer" />
                <span>
                  Balance <strong>{money(inv.balanceCents)}</strong>
                </span>
              </div>

              {inv.portions.length > 0 && <PortionsTable portions={inv.portions} />}

              {inv.payments.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <h3 style={{ marginBottom: 6 }}>Payments</h3>
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Received</th>
                        <th>Method</th>
                        <th className="right">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {inv.payments.map((p) => (
                        <tr key={p.id}>
                          <td>{new Date(p.receivedAt).toLocaleString('en-AU')}</td>
                          <td className="muted">{p.method}</td>
                          <td className="right">{money(p.amountCents)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })
      )}

      {lineFor && (
        <AddLineModal
          title="Add invoice line"
          onClose={() => setLineFor(null)}
          onSubmit={async (line) => {
            await act(() => api.post(`/invoices/${lineFor}/lines`, line));
            setLineFor(null);
          }}
        />
      )}
      {payerFor && (
        <SetPayerModal
          contacts={contacts}
          onClose={() => setPayerFor(null)}
          onSubmit={async (payerContactId) => {
            await act(() => api.post(`/invoices/${payerFor.id}/payer`, { payerContactId }));
            setPayerFor(null);
          }}
        />
      )}
      {splitFor && (
        <ExcessSplitModal
          contacts={contacts}
          onClose={() => setSplitFor(null)}
          onSubmit={async (body) => {
            await act(() => api.post(`/invoices/${splitFor.id}/excess-split`, body));
            setSplitFor(null);
          }}
        />
      )}
      {payFor && (
        <RecordPaymentModal
          invoice={payFor}
          onClose={() => setPayFor(null)}
          onSubmit={async (body) => {
            await act(() => api.post(`/invoices/${payFor.id}/payments`, body));
            setPayFor(null);
          }}
        />
      )}
    </div>
  );
}

function PortionsTable({ portions }: { portions: InvoicePortion[] }) {
  return (
    <div style={{ marginTop: 12 }}>
      <h3 style={{ marginBottom: 6 }}>Portions</h3>
      <table className="table">
        <thead>
          <tr>
            <th>Description</th>
            <th>Payer</th>
            <th className="right">Amount</th>
            <th className="right">Paid</th>
            <th className="right">Balance</th>
          </tr>
        </thead>
        <tbody>
          {portions.map((p) => (
            <tr key={p.id}>
              <td>{p.description}</td>
              <td className="muted">{p.payerName ?? '—'}</td>
              <td className="right">{money(p.amountCents)}</td>
              <td className="right">{money(p.paidCents)}</td>
              <td className="right">{money(p.balanceCents)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SetPayerModal({
  contacts,
  onClose,
  onSubmit,
}: {
  contacts: Contact[];
  onClose: () => void;
  onSubmit: (payerContactId: string) => Promise<void>;
}) {
  const [payerContactId, setPayerContactId] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setErr(null);
    setSaving(true);
    try {
      await onSubmit(payerContactId);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  }

  return (
    <Modal title="Set payer" onClose={onClose}>
      <div className="stack">
        <ErrorBanner message={err} />
        <label className="field">
          Payer
          <select
            className="select"
            value={payerContactId}
            onChange={(e) => setPayerContactId(e.target.value)}
          >
            <option value="">Select a contact…</option>
            {contacts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.displayName}
              </option>
            ))}
          </select>
        </label>
        <div className="row">
          <div className="spacer" />
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn primary"
            disabled={!payerContactId || saving}
            onClick={() => void submit()}
          >
            {saving ? 'Saving…' : 'Set payer'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function ExcessSplitModal({
  contacts,
  onClose,
  onSubmit,
}: {
  contacts: Contact[];
  onClose: () => void;
  onSubmit: (body: {
    primaryPayerContactId: string;
    primaryAmountCents: number;
    excessAmountCents: number;
    excessPayerContactId: string;
  }) => Promise<void>;
}) {
  const [primaryPayerContactId, setPrimaryPayer] = useState('');
  const [primaryAmount, setPrimaryAmount] = useState('');
  const [excessAmount, setExcessAmount] = useState('');
  const [excessPayerContactId, setExcessPayer] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setErr(null);
    setSaving(true);
    try {
      await onSubmit({
        primaryPayerContactId,
        primaryAmountCents: Math.round(parseFloat(primaryAmount) * 100),
        excessAmountCents: Math.round(parseFloat(excessAmount) * 100),
        excessPayerContactId,
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  }

  const canSubmit =
    !!primaryPayerContactId &&
    primaryAmount !== '' &&
    excessAmount !== '' &&
    !!excessPayerContactId &&
    !saving;

  return (
    <Modal title="Insurer / excess split" onClose={onClose}>
      <div className="stack">
        <ErrorBanner message={err} />
        <label className="field">
          Insurer (primary payer)
          <select
            className="select"
            value={primaryPayerContactId}
            onChange={(e) => setPrimaryPayer(e.target.value)}
          >
            <option value="">Select a contact…</option>
            {contacts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.displayName}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Authorised amount ($)
          <input
            className="input"
            type="number"
            value={primaryAmount}
            onChange={(e) => setPrimaryAmount(e.target.value)}
          />
        </label>
        <label className="field">
          Excess amount ($)
          <input
            className="input"
            type="number"
            value={excessAmount}
            onChange={(e) => setExcessAmount(e.target.value)}
          />
        </label>
        <label className="field">
          Excess payer
          <select
            className="select"
            value={excessPayerContactId}
            onChange={(e) => setExcessPayer(e.target.value)}
          >
            <option value="">Select a contact…</option>
            {contacts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.displayName}
              </option>
            ))}
          </select>
        </label>
        <div className="row">
          <div className="spacer" />
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={!canSubmit} onClick={() => void submit()}>
            {saving ? 'Saving…' : 'Apply split'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function RecordPaymentModal({
  invoice,
  onClose,
  onSubmit,
}: {
  invoice: Invoice;
  onClose: () => void;
  onSubmit: (body: { amountCents: number; method: string; portionId?: string }) => Promise<void>;
}) {
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('cash');
  const [portionId, setPortionId] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setErr(null);
    setSaving(true);
    try {
      await onSubmit({
        amountCents: Math.round(parseFloat(amount) * 100),
        method,
        portionId: portionId || undefined,
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  }

  return (
    <Modal title="Record payment" onClose={onClose}>
      <div className="stack">
        <ErrorBanner message={err} />
        <label className="field">
          Amount ($)
          <input
            className="input"
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </label>
        <label className="field">
          Method
          <select className="select" value={method} onChange={(e) => setMethod(e.target.value)}>
            <option value="cash">Cash</option>
            <option value="bank_transfer">Bank transfer</option>
            <option value="card">Card</option>
            <option value="eftpos">EFTPOS</option>
            <option value="other">Other</option>
          </select>
        </label>
        {invoice.portions.length > 0 && (
          <label className="field">
            Portion (optional)
            <select
              className="select"
              value={portionId}
              onChange={(e) => setPortionId(e.target.value)}
            >
              <option value="">Whole invoice</option>
              {invoice.portions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.description} — {money(p.balanceCents)} outstanding
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="row">
          <div className="spacer" />
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn primary"
            disabled={amount === '' || saving}
            onClick={() => void submit()}
          >
            {saving ? 'Recording…' : 'Record payment'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

/* ---------------- Notes ---------------- */

function NotesTab({
  notes,
  jobId,
  act,
}: {
  notes: Note[];
  jobId: string;
  act: (fn: () => Promise<unknown>) => Promise<void>;
}) {
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);
  const sorted = [...notes].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  async function add() {
    if (!body.trim()) return;
    setSaving(true);
    await act(() => api.post(`/work-items/${jobId}/notes`, { body }));
    setBody('');
    setSaving(false);
  }

  return (
    <div className="stack">
      <div className="card">
        <label className="field">
          Add a note
          <textarea
            className="input"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write a note…"
          />
        </label>
        <div className="row" style={{ marginTop: 10 }}>
          <div className="spacer" />
          <button
            className="btn primary"
            disabled={!body.trim() || saving}
            onClick={() => void add()}
          >
            {saving ? 'Adding…' : 'Add note'}
          </button>
        </div>
      </div>

      {sorted.length === 0 ? (
        <div className="card">
          <EmptyState>No notes yet.</EmptyState>
        </div>
      ) : (
        sorted.map((n) => (
          <div key={n.id} className="card">
            <div className="row" style={{ marginBottom: 6 }}>
              <span className="faint mono">{n.authorUserId.slice(0, 8)}</span>
              <div className="spacer" />
              <span className="faint">{new Date(n.createdAt).toLocaleString('en-AU')}</span>
            </div>
            <p style={{ whiteSpace: 'pre-wrap' }}>{n.body}</p>
          </div>
        ))
      )}
    </div>
  );
}

/* ---------------- Photos ---------------- */

const MAX_BYTES = 15 * 1024 * 1024;

function PhotosTab({
  attachments,
  jobId,
  act,
  setActionErr,
}: {
  attachments: Attachment[];
  jobId: string;
  act: (fn: () => Promise<unknown>) => Promise<void>;
  setActionErr: (s: string | null) => void;
}) {
  const [uploading, setUploading] = useState(false);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > MAX_BYTES) {
      setActionErr('File is too large (max 15MB).');
      return;
    }
    setUploading(true);
    setActionErr(null);
    try {
      const dataBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = String(reader.result);
          resolve(result.slice(result.indexOf(',') + 1));
        };
        reader.onerror = () => reject(new Error('Could not read file.'));
        reader.readAsDataURL(file);
      });
      await act(() =>
        api.post(`/work-items/${jobId}/attachments`, {
          fileName: file.name,
          contentType: file.type,
          dataBase64,
        }),
      );
    } catch (err) {
      setActionErr(err instanceof Error ? err.message : String(err));
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="stack">
      <div className="card">
        <label className="field">
          Add photo
          <input
            className="input"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/*"
            disabled={uploading}
            onChange={(e) => void onFile(e)}
          />
        </label>
        {uploading && (
          <span className="faint" style={{ marginTop: 8, display: 'block' }}>
            Uploading…
          </span>
        )}
      </div>

      {attachments.length === 0 ? (
        <div className="card">
          <EmptyState>No photos yet.</EmptyState>
        </div>
      ) : (
        <div className="grid cols-4">
          {attachments.map((att) => (
            <div key={att.id} className="card" style={{ padding: 10 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                className="thumb"
                src={`/api/backend/work-items/${jobId}/attachments/${att.id}/content`}
                alt={att.caption ?? att.fileName}
              />
              <div className="row" style={{ marginTop: 8 }}>
                <span className="faint" style={{ fontSize: 12 }}>
                  {att.caption ?? att.fileName}
                </span>
                <div className="spacer" />
                <button
                  className="btn danger sm"
                  onClick={() =>
                    void act(() => api.del(`/work-items/${jobId}/attachments/${att.id}`))
                  }
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
