'use client';
/**
 * Phase 2 automotive job tabs. Each is self-contained: it loads its own data, and every action runs
 * through a local `act()` that reloads on success and surfaces errors. All hang off a job:
 *   - EstimateTab   — the photo-to-quote pipeline: AI scope → parts list → priced quote → draft PO.
 *   - ClaimFileTab  — the claim pack: paperwork/photos/quotes/invoices/documents + export & share.
 *   - FloorOrdersTab — material requests: raise → manager approve/reject → order (email boundary).
 *   - SupplierInvoicesTab — capture a supplier's invoice → confirm → export to accounting (boundary).
 * Everything shown is a human-confirmed draft; vendor actions (send/share/export/scan) report honestly
 * when no provider is configured.
 */
import { useState } from 'react';
import {
  api,
  ApiError,
  money,
  type AccountingExportResult,
  type ClaimFile,
  type DamageScope,
  type MaterialRequest,
  type OrderSendResult,
  type PurchaseOrder,
  type ScopePart,
  type ShareResult,
  type SupplierInvoice,
} from '@/lib/api';
import { EmptyState, ErrorBanner, Loading, Modal, useAsync } from '@/components/ui';

// ---- shared helpers ----

async function getOpt<T>(path: string): Promise<T | null> {
  try {
    return await api.get<T>(path);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
}

/** A local action runner: clears the error, runs `fn`, reloads on success, captures failures. */
function useAct(reload: () => Promise<unknown>) {
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function act(fn: () => Promise<unknown>): Promise<void> {
    setErr(null);
    setBusy(true);
    try {
      await fn();
      await reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  return { err, busy, act, setErr };
}

const STATUS_COLOR: Record<string, string> = {
  draft: '',
  requested: 'blue',
  confirmed: 'blue',
  approved: 'green',
  sent: 'green',
  ordered: 'green',
  exported: 'green',
  rejected: 'red',
};
function Pill({ status }: { status: string }) {
  return <span className={`badge ${STATUS_COLOR[status] ?? ''}`}>{status}</span>;
}

const OP_COLOR: Record<string, string> = { replace: 'red', repair: 'amber', paint: 'blue' };
function OpPill({ op }: { op: string }) {
  return <span className={`badge ${OP_COLOR[op] ?? ''}`}>{op}</span>;
}

function ResultBanner({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <div className="card" style={{ background: 'var(--panel-2)', padding: '8px 12px' }}>
      <span className="muted">{text}</span>
    </div>
  );
}

const toCents = (v: string): number => Math.round((parseFloat(v) || 0) * 100);

// ============================================================================
// Estimate tab — photo-to-quote pipeline
// ============================================================================

export function EstimateTab({
  jobId,
  reloadJob,
  setTab,
}: {
  jobId: string;
  reloadJob: () => Promise<unknown>;
  setTab: (t: string) => void;
}) {
  const { data, loading, error, reload } = useAsync(
    () =>
      Promise.all([
        getOpt<DamageScope>(`/work-items/${jobId}/ai-scope`),
        api.get<ScopePart[]>(`/work-items/${jobId}/parts-list`),
        api.get<PurchaseOrder[]>(`/work-items/${jobId}/purchase-orders`),
      ]),
    [jobId],
  );
  const { err, busy, act } = useAct(reload);
  const [addPart, setAddPart] = useState(false);
  const [editPart, setEditPart] = useState<ScopePart | null>(null);
  const [sendResult, setSendResult] = useState<string | null>(null);

  if (loading) return <Loading />;
  if (error) return <ErrorBanner message={error} />;
  if (!data) return null;
  const [scope, parts, pos] = data;
  const unpriced = parts.filter((p) => p.unitPriceCents < 1).length;
  const partsTotal = parts.reduce((s, p) => s + p.quantity * p.unitPriceCents, 0);

  return (
    <div className="stack">
      <ErrorBanner message={err} />

      {/* 1 — AI damage scope */}
      <div className="card">
        <div className="row" style={{ marginBottom: 10 }}>
          <h3 style={{ margin: 0 }}>1 · AI damage scope</h3>
          {scope && <span className="badge">{scope.source === 'ai' ? scope.model : 'edited'}</span>}
          <div className="spacer" />
          <button
            className="btn sm"
            disabled={busy}
            onClick={() => void act(() => api.post(`/work-items/${jobId}/ai-scope`))}
          >
            {scope ? 'Regenerate' : 'Generate from photos'}
          </button>
        </div>
        {!scope && (
          <EmptyState>
            No scope yet. Add photos on the Photos tab, then generate a draft scope.
          </EmptyState>
        )}
        {scope && (
          <>
            <p className="muted" style={{ marginTop: 0 }}>
              {scope.summary}
            </p>
            <div className="card pad0">
              <table className="table">
                <thead>
                  <tr>
                    <th>Panel</th>
                    <th>Operation</th>
                    <th>Note</th>
                    <th className="right">Confidence</th>
                  </tr>
                </thead>
                <tbody>
                  {scope.items.map((it) => (
                    <tr key={it.id}>
                      <td>
                        <b>{it.panel}</b>
                      </td>
                      <td>
                        <OpPill op={it.operation} />
                      </td>
                      <td className="muted">{it.note ?? '—'}</td>
                      <td className="right muted">
                        {it.confidence == null ? '—' : `${Math.round(it.confidence * 100)}%`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="row" style={{ marginTop: 10 }}>
              <div className="spacer" />
              <button
                className="btn primary sm"
                disabled={busy}
                onClick={() => void act(() => api.post(`/work-items/${jobId}/parts-list`))}
              >
                Build parts list from scope
              </button>
            </div>
          </>
        )}
      </div>

      {/* 2 — Parts list */}
      <div className="card">
        <div className="row" style={{ marginBottom: 10 }}>
          <h3 style={{ margin: 0 }}>2 · Parts list</h3>
          <div className="spacer" />
          <button className="btn sm" onClick={() => setAddPart(true)}>
            + Add part
          </button>
        </div>
        {parts.length === 0 && (
          <EmptyState>No parts yet — build the list from the scope above, or add one.</EmptyState>
        )}
        {parts.length > 0 && (
          <>
            <div className="card pad0">
              <table className="table">
                <thead>
                  <tr>
                    <th>Part</th>
                    <th className="right">Qty</th>
                    <th className="right">Unit price</th>
                    <th className="right">Line</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {parts.map((p) => (
                    <tr key={p.id}>
                      <td>
                        <b>{p.description}</b>{' '}
                        {p.priceBookItemId ? (
                          <span className="badge green">price book</span>
                        ) : p.source === 'manual' ? (
                          <span className="badge">manual</span>
                        ) : (
                          <span className="badge amber">needs price</span>
                        )}
                      </td>
                      <td className="right">{p.quantity}</td>
                      <td className="right">{money(p.unitPriceCents)}</td>
                      <td className="right">{money(p.quantity * p.unitPriceCents)}</td>
                      <td className="right nowrap">
                        <button className="btn ghost sm" onClick={() => setEditPart(p)}>
                          Edit
                        </button>
                        <button
                          className="btn ghost sm"
                          disabled={busy}
                          onClick={() => void act(() => api.del(`/parts/${p.id}`))}
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="row" style={{ marginTop: 10, alignItems: 'center' }}>
              <span className="muted">Parts total: {money(partsTotal)}</span>
              <div className="spacer" />
              {unpriced > 0 && <span className="faint">Price {unpriced} more before quoting</span>}
              <button
                className="btn primary sm"
                disabled={busy || unpriced > 0}
                onClick={() =>
                  void act(async () => {
                    await api.post(`/work-items/${jobId}/parts-list/quote`);
                    await reloadJob();
                    setTab('quotes');
                  })
                }
              >
                Build quote →
              </button>
            </div>
          </>
        )}
      </div>

      {/* 3 — Purchase orders */}
      <div className="card">
        <div className="row" style={{ marginBottom: 10 }}>
          <h3 style={{ margin: 0 }}>3 · Purchase orders</h3>
          <div className="spacer" />
          <button
            className="btn sm"
            disabled={busy || parts.length === 0}
            onClick={() => void act(() => api.post(`/work-items/${jobId}/purchase-order`, {}))}
          >
            + Draft PO from parts
          </button>
        </div>
        {pos.length === 0 && <EmptyState>No purchase orders drafted yet.</EmptyState>}
        {pos.map((po) => (
          <div
            key={po.id}
            className="card"
            style={{ background: 'var(--panel-2)', marginBottom: 10 }}
          >
            <div className="row" style={{ marginBottom: 8 }}>
              <span className="mono">{po.reference}</span>
              <Pill status={po.status} />
              <div className="spacer" />
              <span className="muted">{money(po.totalCents)}</span>
              {po.status === 'draft' && (
                <button
                  className="btn primary sm"
                  disabled={busy}
                  onClick={() => void act(() => api.post(`/purchase-orders/${po.id}/confirm`))}
                >
                  Confirm
                </button>
              )}
              {po.status === 'confirmed' && (
                <button
                  className="btn sm"
                  disabled={busy}
                  onClick={() =>
                    void act(async () => {
                      const r = await api.post<{ result: OrderSendResult }>(
                        `/purchase-orders/${po.id}/send`,
                      );
                      setSendResult(r.result.reason ?? 'Sent to supplier.');
                    })
                  }
                >
                  Email supplier
                </button>
              )}
            </div>
            <table className="table">
              <tbody>
                {po.lines.map((l) => (
                  <tr key={l.id}>
                    <td>{l.description}</td>
                    <td className="right">{l.quantity}</td>
                    <td className="right">{money(l.unitPriceCents)}</td>
                    <td className="right">{money(l.lineTotalCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
        <ResultBanner text={sendResult} />
      </div>

      {addPart && (
        <AddPartModal
          onClose={() => setAddPart(false)}
          onSubmit={async (body) => {
            await api.post(`/work-items/${jobId}/parts`, body);
            setAddPart(false);
            await reload();
          }}
        />
      )}
      {editPart && (
        <EditLineModal
          title="Edit part"
          initial={editPart}
          withPrice
          onClose={() => setEditPart(null)}
          onSubmit={async (body) => {
            await api.patch(`/parts/${editPart.id}`, body);
            setEditPart(null);
            await reload();
          }}
        />
      )}
    </div>
  );
}

// ============================================================================
// Claim file tab
// ============================================================================

export function ClaimFileTab({ jobId }: { jobId: string }) {
  const { data, loading, error, reload } = useAsync(
    () => api.get<ClaimFile>(`/work-items/${jobId}/claim-file`),
    [jobId],
  );
  const { err, busy, act } = useAct(reload);
  const [shareText, setShareText] = useState<string | null>(null);
  if (loading) return <Loading />;
  if (error) return <ErrorBanner message={error} />;
  if (!data) return null;
  const c = data;

  return (
    <div className="stack">
      <ErrorBanner message={err} />

      <div className="card">
        <div className="row" style={{ marginBottom: 10 }}>
          <h3 style={{ margin: 0 }}>Claim pack · {c.job.reference}</h3>
          <div className="spacer" />
          <button
            className="btn sm"
            disabled={busy}
            onClick={() => void act(() => api.post(`/work-items/${jobId}/claim-file/document`))}
          >
            Generate document
          </button>
          <a
            className="btn sm"
            href={`/api/backend/work-items/${jobId}/claim-file/export`}
            target="_blank"
            rel="noreferrer"
          >
            Export pack
          </a>
          <button
            className="btn sm"
            disabled={busy}
            onClick={() =>
              void act(async () => {
                const r = await api.post<ShareResult>(`/work-items/${jobId}/claim-file/share`);
                setShareText(r.shared ? `Shared: ${r.url}` : (r.reason ?? 'Not shared.'));
              })
            }
          >
            Share
          </button>
        </div>

        <div className="grid cols-4" style={{ marginBottom: 12 }}>
          <Kpi label="Invoiced" value={money(c.financials.invoicedCents)} />
          <Kpi label="Paid" value={money(c.financials.paidCents)} />
          <Kpi label="Outstanding" value={money(c.financials.outstandingCents)} />
          <Kpi
            label="Artefacts"
            value={`${c.counts.photos + c.counts.quotes + c.counts.invoices + c.counts.documents}`}
          />
        </div>

        <div className="grid cols-2">
          <div>
            <div className="faint" style={{ marginBottom: 4 }}>
              Claim
            </div>
            {c.claim ? (
              <div className="stack" style={{ gap: 3 }}>
                <div>
                  <b>Insurer:</b> {c.insurer?.displayName ?? c.claim.insurer}
                </div>
                <div>
                  <b>Claim #:</b> <span className="mono">{c.claim.claimNumber}</span>
                </div>
                {c.claim.assessor && (
                  <div>
                    <b>Assessor:</b> {c.claim.assessor}
                  </div>
                )}
                {c.claim.authorisedAmountCents != null && (
                  <div>
                    <b>Authorised:</b> {money(c.claim.authorisedAmountCents)}
                  </div>
                )}
                {c.claim.excessCents != null && (
                  <div>
                    <b>Excess:</b> {money(c.claim.excessCents)}
                  </div>
                )}
              </div>
            ) : (
              <span className="muted">No claim recorded on this job.</span>
            )}
          </div>
          <div>
            <div className="faint" style={{ marginBottom: 4 }}>
              Customer &amp; vehicle
            </div>
            <div className="stack" style={{ gap: 3 }}>
              <div>
                <b>{c.customer?.displayName ?? '—'}</b>
              </div>
              {c.customer?.phone && <div className="muted">{c.customer.phone}</div>}
              <div className="muted">{c.vehicles.map((v) => v.label).join(', ') || '—'}</div>
            </div>
          </div>
        </div>
        <ResultBanner text={shareText} />
      </div>

      <ArtefactList
        title={`Photos (${c.counts.photos})`}
        rows={c.photos.map((p) => ({
          key: p.id,
          main: p.fileName,
          sub: p.caption ?? p.contentType,
        }))}
      />
      <ArtefactList
        title={`Quotes (${c.counts.quotes})`}
        rows={c.quotes.map((q) => ({
          key: q.id,
          main: q.reference,
          sub: q.status,
          right: money(q.totalCents),
        }))}
      />
      <ArtefactList
        title={`Invoices (${c.counts.invoices})`}
        rows={c.invoices.map((i) => ({
          key: i.id,
          main: i.reference,
          sub: i.status,
          right: money(i.totalCents),
        }))}
      />
      <ArtefactList
        title={`Documents (${c.counts.documents})`}
        rows={c.documents.map((d) => ({
          key: d.id,
          main: d.type,
          sub: d.templateRef,
          href: `/api/backend/claim-file/documents/${d.id}/content`,
        }))}
      />
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="card" style={{ background: 'var(--panel-2)' }}>
      <div
        className="faint"
        style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.04em' }}
      >
        {label}
      </div>
      <div style={{ fontSize: 20, fontWeight: 800 }}>{value}</div>
    </div>
  );
}

function ArtefactList({
  title,
  rows,
}: {
  title: string;
  rows: { key: string; main: string; sub?: string; right?: string; href?: string }[];
}) {
  return (
    <div className="card">
      <div className="row" style={{ marginBottom: 8 }}>
        <h3 style={{ margin: 0, fontSize: 14 }}>{title}</h3>
      </div>
      {rows.length === 0 ? (
        <span className="faint">None.</span>
      ) : (
        <div className="stack" style={{ gap: 6 }}>
          {rows.map((r) => (
            <div key={r.key} className="row" style={{ alignItems: 'center' }}>
              {r.href ? (
                <a className="link-btn" href={r.href} target="_blank" rel="noreferrer">
                  {r.main}
                </a>
              ) : (
                <b>{r.main}</b>
              )}
              {r.sub && <span className="faint">· {r.sub}</span>}
              <div className="spacer" />
              {r.right && <span className="muted">{r.right}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Floor orders tab — material requests
// ============================================================================

export function FloorOrdersTab({ jobId }: { jobId: string }) {
  const { data, loading, error, reload } = useAsync(
    () => api.get<MaterialRequest[]>(`/work-items/${jobId}/material-requests`),
    [jobId],
  );
  const { err, busy, act } = useAct(reload);
  const [create, setCreate] = useState(false);
  const [orderText, setOrderText] = useState<string | null>(null);
  if (loading) return <Loading />;
  if (error) return <ErrorBanner message={error} />;
  if (!data) return null;

  return (
    <div className="stack">
      <ErrorBanner message={err} />
      <div className="row">
        <span className="muted">
          Materials a technician needs; a manager approves, then it&apos;s ordered.
        </span>
        <div className="spacer" />
        <button className="btn primary sm" onClick={() => setCreate(true)}>
          + New request
        </button>
      </div>

      {data.length === 0 && <EmptyState>No material requests yet.</EmptyState>}
      {data.map((r) => (
        <div key={r.id} className="card">
          <div className="row" style={{ marginBottom: 8 }}>
            <span className="mono">{r.reference}</span>
            <Pill status={r.status} />
            <div className="spacer" />
            {r.status === 'requested' && (
              <>
                <button
                  className="btn primary sm"
                  disabled={busy}
                  onClick={() => void act(() => api.post(`/material-requests/${r.id}/approve`, {}))}
                >
                  Approve
                </button>
                <button
                  className="btn sm"
                  disabled={busy}
                  onClick={() => void act(() => api.post(`/material-requests/${r.id}/reject`, {}))}
                >
                  Reject
                </button>
              </>
            )}
            {r.status === 'approved' && (
              <button
                className="btn sm"
                disabled={busy}
                onClick={() =>
                  void act(async () => {
                    const res = await api.post<{ result: OrderSendResult }>(
                      `/material-requests/${r.id}/order`,
                    );
                    setOrderText(res.result.reason ?? 'Ordered — supplier emailed.');
                  })
                }
              >
                Order (email supplier)
              </button>
            )}
          </div>
          {r.notes && (
            <p className="muted" style={{ marginTop: 0 }}>
              {r.notes}
            </p>
          )}
          <table className="table">
            <tbody>
              {r.lines.map((l) => (
                <tr key={l.id}>
                  <td>{l.description}</td>
                  <td className="right">×{l.quantity}</td>
                  <td className="muted">{l.notes ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {r.decisionNote && (
            <div className="faint" style={{ marginTop: 6 }}>
              Decision: {r.decisionNote}
            </div>
          )}
        </div>
      ))}
      <ResultBanner text={orderText} />

      {create && (
        <LinesModal
          title="New material request"
          fields={['description', 'quantity', 'notes']}
          onClose={() => setCreate(false)}
          onSubmit={async (lines, notes) => {
            await api.post(`/work-items/${jobId}/material-requests`, { lines, notes });
            setCreate(false);
            await reload();
          }}
        />
      )}
    </div>
  );
}

// ============================================================================
// Supplier invoices tab — capture
// ============================================================================

export function SupplierInvoicesTab({ jobId }: { jobId: string }) {
  const { data, loading, error, reload } = useAsync(
    () => api.get<SupplierInvoice[]>(`/work-items/${jobId}/supplier-invoices`),
    [jobId],
  );
  const { err, busy, act } = useAct(reload);
  const [capture, setCapture] = useState(false);
  const [editLine, setEditLine] = useState<{
    invId: string;
    line: SupplierInvoice['lines'][number];
  } | null>(null);
  const [exportText, setExportText] = useState<string | null>(null);
  if (loading) return <Loading />;
  if (error) return <ErrorBanner message={error} />;
  if (!data) return null;

  return (
    <div className="stack">
      <ErrorBanner message={err} />
      <div className="row">
        <span className="muted">
          Capture a supplier&apos;s invoice as a draft, then export it to accounting.
        </span>
        <div className="spacer" />
        <button className="btn primary sm" onClick={() => setCapture(true)}>
          + Capture invoice
        </button>
      </div>
      <span className="faint">
        Scanning invoices (OCR) becomes available when an OCR provider is connected.
      </span>

      {data.length === 0 && <EmptyState>No supplier invoices captured yet.</EmptyState>}
      {data.map((inv) => (
        <div key={inv.id} className="card">
          <div className="row" style={{ marginBottom: 8 }}>
            <span className="mono">{inv.invoiceNumber}</span>
            <Pill status={inv.status} />
            {inv.invoiceDate && <span className="faint">{inv.invoiceDate}</span>}
            <div className="spacer" />
            <span className="muted">{money(inv.totalCents)}</span>
            {inv.status === 'draft' && (
              <button
                className="btn primary sm"
                disabled={busy}
                onClick={() => void act(() => api.post(`/supplier-invoices/${inv.id}/confirm`))}
              >
                Confirm
              </button>
            )}
            {inv.status === 'confirmed' && (
              <button
                className="btn sm"
                disabled={busy}
                onClick={() =>
                  void act(async () => {
                    const r = await api.post<{ result: AccountingExportResult }>(
                      `/supplier-invoices/${inv.id}/export-to-accounting`,
                    );
                    setExportText(r.result.reason ?? 'Exported to accounting.');
                  })
                }
              >
                Export to accounting
              </button>
            )}
          </div>
          <table className="table">
            <tbody>
              {inv.lines.map((l) => (
                <tr key={l.id}>
                  <td>{l.description}</td>
                  <td className="right">{l.quantity}</td>
                  <td className="right">{money(l.unitPriceCents)}</td>
                  <td className="right">{money(l.lineTotalCents)}</td>
                  <td className="right">
                    {inv.status === 'draft' && (
                      <button
                        className="btn ghost sm"
                        onClick={() => setEditLine({ invId: inv.id, line: l })}
                      >
                        Edit
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
      <ResultBanner text={exportText} />

      {capture && (
        <LinesModal
          title="Capture supplier invoice"
          fields={['description', 'quantity', 'unitPrice']}
          extraHeader
          onClose={() => setCapture(false)}
          onSubmit={async (lines, notes, header) => {
            await api.post(`/work-items/${jobId}/supplier-invoices`, {
              invoiceNumber: header?.invoiceNumber,
              invoiceDate: header?.invoiceDate || undefined,
              notes: notes || undefined,
              lines,
            });
            setCapture(false);
            await reload();
          }}
        />
      )}
      {editLine && (
        <EditLineModal
          title="Edit line"
          initial={editLine.line}
          withPrice
          onClose={() => setEditLine(null)}
          onSubmit={async (body) => {
            await api.patch(`/supplier-invoices/${editLine.invId}/lines/${editLine.line.id}`, body);
            setEditLine(null);
            await reload();
          }}
        />
      )}
    </div>
  );
}

// ============================================================================
// Shared modals
// ============================================================================

function AddPartModal({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (body: {
    description: string;
    quantity: number;
    unitPriceCents: number;
  }) => Promise<void>;
}) {
  const [description, setDescription] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [price, setPrice] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function submit() {
    setErr(null);
    setSaving(true);
    try {
      await onSubmit({
        description,
        quantity: parseInt(quantity) || 1,
        unitPriceCents: toCents(price),
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  }
  return (
    <Modal title="Add part" onClose={onClose}>
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
        <div className="row">
          <label className="field" style={{ flex: 1 }}>
            Qty
            <input
              className="input"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
          </label>
          <label className="field" style={{ flex: 1 }}>
            Unit price ($)
            <input className="input" value={price} onChange={(e) => setPrice(e.target.value)} />
          </label>
        </div>
        <div className="row">
          <div className="spacer" />
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn primary"
            disabled={!description || saving}
            onClick={() => void submit()}
          >
            {saving ? 'Adding…' : 'Add part'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function EditLineModal({
  title,
  initial,
  withPrice,
  onClose,
  onSubmit,
}: {
  title: string;
  initial: { description: string; quantity: number; unitPriceCents?: number };
  withPrice?: boolean;
  onClose: () => void;
  onSubmit: (body: {
    description: string;
    quantity: number;
    unitPriceCents?: number;
  }) => Promise<void>;
}) {
  const [description, setDescription] = useState(initial.description);
  const [quantity, setQuantity] = useState(String(initial.quantity));
  const [price, setPrice] = useState(
    initial.unitPriceCents != null ? (initial.unitPriceCents / 100).toString() : '',
  );
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function submit() {
    setErr(null);
    setSaving(true);
    try {
      await onSubmit({
        description,
        quantity: parseInt(quantity) || 1,
        ...(withPrice ? { unitPriceCents: toCents(price) } : {}),
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  }
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
        <div className="row">
          <label className="field" style={{ flex: 1 }}>
            Qty
            <input
              className="input"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
          </label>
          {withPrice && (
            <label className="field" style={{ flex: 1 }}>
              Unit price ($)
              <input className="input" value={price} onChange={(e) => setPrice(e.target.value)} />
            </label>
          )}
        </div>
        <div className="row">
          <div className="spacer" />
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={saving} onClick={() => void submit()}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

interface DraftLine {
  description: string;
  quantity: string;
  unitPrice: string;
  notes: string;
}

/** A create modal with a dynamic set of line rows, plus an optional invoice header. */
function LinesModal({
  title,
  fields,
  extraHeader,
  onClose,
  onSubmit,
}: {
  title: string;
  fields: ('description' | 'quantity' | 'unitPrice' | 'notes')[];
  extraHeader?: boolean;
  onClose: () => void;
  onSubmit: (
    lines: Record<string, unknown>[],
    notes: string,
    header?: { invoiceNumber: string; invoiceDate: string },
  ) => Promise<void>;
}) {
  const [rows, setRows] = useState<DraftLine[]>([
    { description: '', quantity: '1', unitPrice: '', notes: '' },
  ]);
  const [notes, setNotes] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceDate, setInvoiceDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const set = (i: number, k: keyof DraftLine, v: string) =>
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, [k]: v } : r)));

  async function submit() {
    setErr(null);
    setSaving(true);
    try {
      const lines = rows
        .filter((r) => r.description.trim())
        .map((r) => ({
          description: r.description.trim(),
          ...(fields.includes('quantity') ? { quantity: parseInt(r.quantity) || 1 } : {}),
          ...(fields.includes('unitPrice') ? { unitPriceCents: toCents(r.unitPrice) } : {}),
          ...(fields.includes('notes') && r.notes.trim() ? { notes: r.notes.trim() } : {}),
        }));
      await onSubmit(lines, notes, extraHeader ? { invoiceNumber, invoiceDate } : undefined);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  }

  const canSubmit =
    rows.some((r) => r.description.trim()) && (!extraHeader || invoiceNumber.trim());

  return (
    <Modal title={title} onClose={onClose} wide>
      <div className="stack">
        <ErrorBanner message={err} />
        {extraHeader && (
          <div className="row">
            <label className="field" style={{ flex: 2 }}>
              Invoice number
              <input
                className="input"
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
              />
            </label>
            <label className="field" style={{ flex: 1 }}>
              Invoice date
              <input
                className="input"
                placeholder="2026-07-05"
                value={invoiceDate}
                onChange={(e) => setInvoiceDate(e.target.value)}
              />
            </label>
          </div>
        )}
        <div className="stack" style={{ gap: 8 }}>
          {rows.map((r, i) => (
            <div key={i} className="row" style={{ alignItems: 'flex-end' }}>
              <label className="field" style={{ flex: 3 }}>
                {i === 0 ? 'Description' : ''}
                <input
                  className="input"
                  value={r.description}
                  onChange={(e) => set(i, 'description', e.target.value)}
                />
              </label>
              {fields.includes('quantity') && (
                <label className="field" style={{ flex: 1 }}>
                  {i === 0 ? 'Qty' : ''}
                  <input
                    className="input"
                    value={r.quantity}
                    onChange={(e) => set(i, 'quantity', e.target.value)}
                  />
                </label>
              )}
              {fields.includes('unitPrice') && (
                <label className="field" style={{ flex: 1 }}>
                  {i === 0 ? 'Unit ($)' : ''}
                  <input
                    className="input"
                    value={r.unitPrice}
                    onChange={(e) => set(i, 'unitPrice', e.target.value)}
                  />
                </label>
              )}
              {fields.includes('notes') && (
                <label className="field" style={{ flex: 2 }}>
                  {i === 0 ? 'Notes' : ''}
                  <input
                    className="input"
                    value={r.notes}
                    onChange={(e) => set(i, 'notes', e.target.value)}
                  />
                </label>
              )}
              <button
                className="btn ghost sm"
                onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}
                disabled={rows.length === 1}
              >
                ×
              </button>
            </div>
          ))}
          <button
            className="btn ghost sm"
            style={{ alignSelf: 'flex-start' }}
            onClick={() =>
              setRows((rs) => [...rs, { description: '', quantity: '1', unitPrice: '', notes: '' }])
            }
          >
            + Add line
          </button>
        </div>
        <label className="field">
          Notes (optional)
          <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
        <div className="row">
          <div className="spacer" />
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn primary"
            disabled={!canSubmit || saving}
            onClick={() => void submit()}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
