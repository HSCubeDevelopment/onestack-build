'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Camera,
  Upload,
  X,
  FileText,
  CheckCircle2,
  Sparkles,
  Loader2,
  ReceiptText,
  Pencil,
} from 'lucide-react';
import { api, ApiError, money } from '@/lib/api';
import { compressToBase64, fileToBase64 } from '@/lib/image';
import { AtTopbar, SignOutButton } from '@/components/autotech/kit';

/**
 * Capture an infringement / police ticket against a car — upload the PDF or photograph the notice, let AI
 * read the details, check them, and save. Replaces the old all-manual form: the person no longer types
 * every field, they confirm what the extractor read (golden rule — the AI output is an editable draft).
 * The confirmed ticket is stored in the tickets table (queryable by rego / due date / status) with the
 * original file kept, and every ticket already on the car is shown so nothing is filed twice.
 */

interface CapturedFile {
  dataBase64: string;
  contentType: string;
  name: string;
  isPdf: boolean;
  preview: string | null; // data URL for images; null for PDFs
}

interface Extraction {
  noticeType: string;
  noticeNumber: string;
  infringementNumber: string;
  obligationNumber: string;
  rego: string;
  state: string;
  agency: string;
  offence: string;
  offenceCode: string;
  offenceDate: string;
  offenceTime: string;
  location: string;
  issueDate: string;
  dueDate: string;
  penaltyCents: number;
  feesCents: number;
  amountDueCents: number;
  recipientName: string;
  recipientAbn: string;
  recipientAddress: string;
  notes: string;
}

/** The review form — all text (amounts are dollar strings) so editing is natural; converted on save. */
interface Form {
  rego: string;
  noticeType: string;
  noticeNumber: string;
  infringementNumber: string;
  obligationNumber: string;
  state: string;
  agency: string;
  offence: string;
  offenceCode: string;
  offenceDate: string;
  offenceTime: string;
  location: string;
  issueDate: string;
  dueDate: string;
  amountDue: string;
  penalty: string;
  fees: string;
  recipientName: string;
  recipientAbn: string;
  recipientAddress: string;
  notes: string;
}

interface TicketView {
  id: string;
  rego: string;
  noticeType: string;
  noticeNumber: string;
  agency: string;
  offence: string;
  offenceAt: string;
  dueDate: string;
  amountDueCents: number;
  status: string;
  hasFile: boolean;
  createdAt: string;
}

const STATUS_BADGE: Record<string, string> = {
  open: 'amber',
  paid: 'green',
  disputed: 'purple',
  cancelled: 'gray',
};

const centsToDollar = (c: number): string => (c ? (c / 100).toFixed(2) : '');
const dollarToCents = (s: string): number => {
  const n = Number((s || '').replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
};

function blankExtraction(): Extraction {
  return {
    noticeType: '',
    noticeNumber: '',
    infringementNumber: '',
    obligationNumber: '',
    rego: '',
    state: '',
    agency: '',
    offence: '',
    offenceCode: '',
    offenceDate: '',
    offenceTime: '',
    location: '',
    issueDate: '',
    dueDate: '',
    penaltyCents: 0,
    feesCents: 0,
    amountDueCents: 0,
    recipientName: '',
    recipientAbn: '',
    recipientAddress: '',
    notes: '',
  };
}

function toForm(rego: string, x: Extraction): Form {
  return {
    rego: x.rego || rego,
    noticeType: x.noticeType,
    noticeNumber: x.noticeNumber,
    infringementNumber: x.infringementNumber,
    obligationNumber: x.obligationNumber,
    state: x.state,
    agency: x.agency,
    offence: x.offence,
    offenceCode: x.offenceCode,
    offenceDate: x.offenceDate,
    offenceTime: x.offenceTime,
    location: x.location,
    issueDate: x.issueDate,
    dueDate: x.dueDate,
    amountDue: centsToDollar(x.amountDueCents),
    penalty: centsToDollar(x.penaltyCents),
    fees: centsToDollar(x.feesCents),
    recipientName: x.recipientName,
    recipientAbn: x.recipientAbn,
    recipientAddress: x.recipientAddress,
    notes: x.notes,
  };
}

export function TicketForm() {
  const [rego, setRego] = useState('');
  const [files, setFiles] = useState<CapturedFile[]>([]);
  const [processing, setProcessing] = useState(false);
  const [form, setForm] = useState<Form | null>(null);
  const [model, setModel] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [existing, setExisting] = useState<TicketView[]>([]);
  const [allTickets, setAllTickets] = useState<TicketView[]>([]);

  const set = (k: keyof Form, v: string) => setForm((f) => (f ? { ...f, [k]: v } : f));

  // Load every ticket (across all cars) so the screen doubles as a ticket register with full detail.
  async function loadAll(): Promise<void> {
    setAllTickets(await api.getOr<TicketView[]>('/tickets', []));
  }
  useEffect(() => {
    void loadAll();
  }, []);

  async function addFiles(list: FileList | null): Promise<void> {
    if (!list?.length) return;
    setErr(null);
    const added: CapturedFile[] = [];
    for (const file of Array.from(list)) {
      try {
        if (file.type === 'application/pdf') {
          const { dataBase64, contentType } = await fileToBase64(file);
          added.push({ dataBase64, contentType, name: file.name, isPdf: true, preview: null });
        } else {
          const { dataBase64, contentType } = await compressToBase64(file);
          added.push({
            dataBase64,
            contentType,
            name: file.name || 'Photo',
            isPdf: false,
            preview: `data:${contentType};base64,${dataBase64}`,
          });
        }
      } catch {
        setErr('Could not read that file — try again.');
      }
    }
    setFiles((prev) => [...prev, ...added].slice(0, 5)); // cost cap: at most 5 files per ticket
  }

  const removeFile = (i: number) => setFiles((prev) => prev.filter((_, n) => n !== i));

  async function loadExisting(r: string): Promise<void> {
    const q = r.trim();
    if (!q) {
      setExisting([]);
      return;
    }
    const list = await api.getOr<TicketView[]>(`/tickets?rego=${encodeURIComponent(q)}`, []);
    setExisting(list);
  }

  async function process(): Promise<void> {
    if (!rego.trim() || files.length === 0) return;
    setProcessing(true);
    setErr(null);
    try {
      const res = await api.post<{ model: string; extraction: Extraction }>('/tickets/extract', {
        files: files.map((f) => ({ dataBase64: f.dataBase64, contentType: f.contentType })),
      });
      setModel(res.model);
      setForm(toForm(rego.trim().toUpperCase(), res.extraction));
      void loadExisting(rego);
    } catch (e) {
      setErr(
        e instanceof ApiError ? e.message : 'Could not read the ticket — check the file and retry.',
      );
    } finally {
      setProcessing(false);
    }
  }

  /** Skip AI and fill the details in by hand (e.g. AI unavailable, or an awkward notice). */
  function enterManually(): void {
    setModel('manual');
    setForm(toForm(rego.trim().toUpperCase(), blankExtraction()));
    void loadExisting(rego);
  }

  async function save(): Promise<void> {
    if (!form) return;
    if (!form.rego.trim()) {
      setErr('Enter the vehicle registration.');
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      const first = files[0];
      await api.post<TicketView>('/tickets', {
        rego: form.rego.trim(),
        noticeType: form.noticeType,
        noticeNumber: form.noticeNumber,
        infringementNumber: form.infringementNumber,
        obligationNumber: form.obligationNumber,
        state: form.state,
        agency: form.agency,
        offence: form.offence,
        offenceCode: form.offenceCode,
        offenceDate: form.offenceDate,
        offenceTime: form.offenceTime,
        location: form.location,
        issueDate: form.issueDate,
        dueDate: form.dueDate,
        recipientName: form.recipientName,
        recipientAbn: form.recipientAbn,
        recipientAddress: form.recipientAddress,
        notes: form.notes,
        amountDueCents: dollarToCents(form.amountDue),
        penaltyCents: dollarToCents(form.penalty),
        feesCents: dollarToCents(form.fees),
        source: first?.isPdf ? 'pdf' : 'photo',
        data: {
          ...form,
          amountDueCents: dollarToCents(form.amountDue),
          penaltyCents: dollarToCents(form.penalty),
          feesCents: dollarToCents(form.fees),
          filesCaptured: files.length,
          extractedBy: model,
        },
        file: first ? { dataBase64: first.dataBase64, contentType: first.contentType } : undefined,
      });
      setDone(form.rego.trim().toUpperCase());
      void loadAll();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Could not save the ticket.');
      setSaving(false);
    }
  }

  async function markPaid(id: string): Promise<void> {
    try {
      const updated = await api.patch<TicketView>(`/tickets/${id}`, { status: 'paid' });
      const swap = (prev: TicketView[]) => prev.map((t) => (t.id === id ? updated : t));
      setExisting(swap);
      setAllTickets(swap);
    } catch {
      /* non-critical */
    }
  }

  function reset(): void {
    setRego('');
    setFiles([]);
    setForm(null);
    setModel('');
    setErr(null);
    setDone(null);
    setExisting([]);
  }

  const TicketList = ({ title, items }: { title: string; items: TicketView[] }) =>
    items.length === 0 ? null : (
      <>
        <div className="at-phase-head" style={{ marginTop: 20 }}>
          <span className="t">{title}</span>
          <span className="c">{items.length}</span>
        </div>
        {items.map((t) => (
          <div key={t.id} className="at-tk">
            <div className="hd">
              <div>
                <div className="ty">
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
                <span className={`at-badge ${STATUS_BADGE[t.status] ?? 'gray'}`}>{t.status}</span>
              </div>
            </div>
            <div className="act">
              {t.hasFile && (
                <a
                  className="at-chip"
                  href={`/api/backend/tickets/${t.id}/file`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <FileText size={14} /> View notice
                </a>
              )}
              {t.status === 'open' && (
                <button className="at-chip" onClick={() => void markPaid(t.id)}>
                  Mark paid
                </button>
              )}
            </div>
          </div>
        ))}
      </>
    );

  // ---- Done ----
  if (done) {
    return (
      <>
        <AtTopbar backHref="/" right={<SignOutButton />} />
        <div className="at-done">
          <CheckCircle2 size={56} strokeWidth={2} color="var(--at-green)" />
          <div className="at-done-t">Ticket saved</div>
          <div className="at-done-s">Filed against {done}. You’ll find it on the car’s record.</div>
          <button className="at-btn primary" style={{ marginTop: 18 }} onClick={reset}>
            Add another ticket
          </button>
          <Link href="/" className="at-btn ghost" style={{ marginTop: 10 }}>
            Done
          </Link>
        </div>
      </>
    );
  }

  // ---- Review (AI-extracted, editable) ----
  if (form) {
    const F = ({
      label,
      k,
      placeholder,
      wide,
    }: {
      label: string;
      k: keyof Form;
      placeholder?: string;
      wide?: boolean;
    }) => (
      <div className={`at-field ${wide ? 'full' : ''}`} style={{ margin: 0 }}>
        <div className="at-flabel">{label}</div>
        <input
          className="at-input"
          value={form[k]}
          onChange={(e) => set(k, e.target.value)}
          placeholder={placeholder}
        />
      </div>
    );
    return (
      <>
        <AtTopbar backHref="/" right={<SignOutButton />} />
        <button className="at-back-link" onClick={() => setForm(null)}>
          ‹ Back to files
        </button>
        <div className="at-h2">Check the details</div>
        <div className={model === 'manual' ? 'at-note' : 'at-aihint'}>
          {model === 'manual' ? (
            'Enter the ticket details from the notice.'
          ) : (
            <>
              <Sparkles size={16} /> Read from the notice
              {model && model !== 'stub' ? ` by ${model}` : ''} — please check and fix anything.
            </>
          )}
        </div>

        {err && <div className="at-errbanner">{err}</div>}

        <div className="at-field">
          <div className="at-flabel">Registration *</div>
          <input
            className="at-input rego"
            value={form.rego}
            onChange={(e) => set('rego', e.target.value.toUpperCase())}
            autoCapitalize="characters"
            autoCorrect="off"
          />
        </div>

        <div className="at-grid2" style={{ marginTop: 10 }}>
          <F label="Notice type" k="noticeType" placeholder="Infringement notice" />
          <F label="Notice number" k="noticeNumber" />
          <F label="Issued by" k="agency" placeholder="e.g. Melbourne City Council" wide />
          <div className="at-field full" style={{ margin: 0 }}>
            <div className="at-flabel">Offence</div>
            <input
              className="at-input"
              value={form.offence}
              onChange={(e) => set('offence', e.target.value)}
              placeholder="e.g. parked — fail to pay fee"
            />
          </div>
          <F label="Offence date" k="offenceDate" placeholder="18 MAR 2026" />
          <F label="Offence time" k="offenceTime" placeholder="5:33pm" />
          <F label="Location" k="location" wide />
          <F label="Issue date" k="issueDate" />
          <F label="Due date" k="dueDate" placeholder="10 AUG 2026" />
          <F label="Amount due ($)" k="amountDue" />
          <F label="Penalty ($)" k="penalty" />
          <F label="Fees ($)" k="fees" />
          <F label="Recipient" k="recipientName" wide />
          <div className="at-field full" style={{ margin: 0 }}>
            <div className="at-flabel">Notes</div>
            <input
              className="at-input"
              value={form.notes}
              onChange={(e) => set('notes', e.target.value)}
            />
          </div>
        </div>

        <button
          className="at-btn primary"
          style={{ marginTop: 16 }}
          disabled={saving || !form.rego.trim()}
          onClick={() => void save()}
        >
          <ReceiptText size={18} strokeWidth={2.3} />
          {saving ? 'Saving…' : 'Save ticket'}
        </button>

        <TicketList title="On this car" items={existing} />
      </>
    );
  }

  // ---- Capture (rego + files) ----
  const canProcess = !!rego.trim() && files.length > 0 && !processing;
  return (
    <>
      <AtTopbar backHref="/" right={<SignOutButton />} />
      <div className="at-h2">Add a ticket</div>
      <div className="at-note">
        Photograph or upload the infringement notice (PDF or photo). We’ll read the details for you
        — you just check and save.
      </div>

      {err && <div className="at-errbanner">{err}</div>}

      <div className="at-field">
        <div className="at-flabel">Registration</div>
        <input
          className="at-input rego"
          value={rego}
          onChange={(e) => setRego(e.target.value.toUpperCase())}
          onBlur={() => void loadExisting(rego)}
          autoCapitalize="characters"
          autoCorrect="off"
          placeholder="e.g. BBW 027"
        />
      </div>

      <div className="at-field">
        <div className="at-flabel">The notice</div>
        {files.length > 0 && (
          <div className="at-photorow" style={{ marginBottom: 10 }}>
            {files.map((f, i) =>
              f.isPdf ? (
                <div key={i} className="at-filechip">
                  <FileText size={16} />
                  <span className="nm">{f.name}</span>
                  <button className="rm" aria-label="Remove" onClick={() => removeFile(i)}>
                    <X size={14} strokeWidth={3} />
                  </button>
                </div>
              ) : (
                <div key={i} className="at-photothumb" title={f.name}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={f.preview ?? ''} alt="Ticket" />
                  <button className="rm" aria-label="Remove" onClick={() => removeFile(i)}>
                    <X size={14} strokeWidth={3} />
                  </button>
                </div>
              ),
            )}
          </div>
        )}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <label className="at-photoadd" style={{ cursor: 'pointer', flex: 1 }}>
            <Camera size={24} strokeWidth={2} />
            <span>Take photo</span>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              style={{ display: 'none' }}
              onChange={(e) => void addFiles(e.target.files)}
            />
          </label>
          <label className="at-photoadd" style={{ cursor: 'pointer', flex: 1 }}>
            <Upload size={24} strokeWidth={2} />
            <span>Upload PDF / photo</span>
            <input
              type="file"
              accept="image/*,application/pdf"
              multiple
              style={{ display: 'none' }}
              onChange={(e) => void addFiles(e.target.files)}
            />
          </label>
        </div>
      </div>

      <button
        className="at-btn primary"
        style={{ marginTop: 8 }}
        disabled={!canProcess}
        onClick={() => void process()}
      >
        {processing ? (
          <>
            <Loader2 size={18} className="at-spin-ic" /> Reading…
          </>
        ) : (
          <>
            <Sparkles size={18} strokeWidth={2.3} /> Process ticket
          </>
        )}
      </button>
      <button
        className="at-btn ghost"
        style={{ marginTop: 10 }}
        disabled={processing}
        onClick={enterManually}
      >
        <Pencil size={16} /> Enter manually
      </button>

      {existing.length > 0 && <TicketList title="On this car" items={existing} />}
      <TicketList title="All tickets" items={allTickets} />
    </>
  );
}
