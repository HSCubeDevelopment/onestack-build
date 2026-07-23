'use client';
import { useMemo, useRef, useState } from 'react';
import { Camera, Sparkles, Trash2, Plus, X, AlertTriangle } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { compressToBase64 } from '@/lib/image';
import {
  aud,
  EstimateLabour,
  EstimatePart,
  EstimateResult,
  OPERATION_LABEL,
  recompute,
} from '@/lib/estimate';
import { AtTopbar, SignOutButton } from '@/components/autotech/kit';

const MAX_PHOTOS = 6;

interface Photo {
  dataBase64: string;
  contentType: string;
  preview: string;
}

/**
 * Instant estimate — the employee snaps photos of a damaged car and gets a rough, editable draft: what
 * needs fixing, the parts likely needed, and a ballpark price. The AI reads the photos (server-side,
 * Claude vision); the money is transparent arithmetic the worker adjusts before it's ever a real quote.
 * Nothing is saved or sent — this screen exists to speed up the human, not replace them.
 */
export function EstimateFlow() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // The editable draft, once we have one. `null` = not requested yet; a result with configured:false =
  // the AI estimator isn't wired.
  const [result, setResult] = useState<EstimateResult | null>(null);

  async function addFiles(files: FileList) {
    setErr(null);
    const room = MAX_PHOTOS - photos.length;
    const picked = Array.from(files).slice(0, Math.max(0, room));
    for (const f of picked) {
      try {
        const { dataBase64, contentType } = await compressToBase64(f);
        setPhotos((p) => [
          ...p,
          { dataBase64, contentType, preview: `data:${contentType};base64,${dataBase64}` },
        ]);
      } catch {
        setErr('Could not read one of the photos — try again.');
      }
    }
    if (inputRef.current) inputRef.current.value = '';
  }

  async function getEstimate() {
    if (photos.length === 0) return;
    setBusy(true);
    setErr(null);
    setResult(null);
    try {
      const res = await api.post<EstimateResult>('/estimates/from-photos', {
        photos: photos.map((p) => ({ dataBase64: p.dataBase64, contentType: p.contentType })),
        notes: notes.trim() || undefined,
      });
      setResult(res);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Could not get an estimate — try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <AtTopbar backHref="/inout" right={<SignOutButton />} />
      <div className="at-h2">Instant estimate</div>
      <div className="at-note">
        Snap a few photos of the damage and get a rough draft — parts, repairs and a ballpark price
        to speed up your quote.
      </div>

      {err && <div className="at-errbanner">{err}</div>}

      {result && result.configured ? (
        <EstimateResultView
          result={result}
          onRestart={() => {
            setResult(null);
            setPhotos([]);
            setNotes('');
          }}
        />
      ) : result && !result.configured ? (
        <div className="at-empty">
          The AI estimator isn’t connected yet — ask the owner to enable it.
          <div style={{ marginTop: 14 }}>
            <button type="button" className="at-btn ghost" onClick={() => setResult(null)}>
              Back
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Photo capture */}
          <div className="at-photorow">
            {photos.map((p, i) => (
              <div key={i} className="at-photothumb">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.preview} alt={`Damage photo ${i + 1}`} />
                <button
                  type="button"
                  className="rm"
                  aria-label="Remove photo"
                  onClick={() => setPhotos((ps) => ps.filter((_, j) => j !== i))}
                >
                  <X size={14} strokeWidth={3} />
                </button>
              </div>
            ))}
            {photos.length < MAX_PHOTOS && (
              <button
                type="button"
                className="at-photoadd"
                onClick={() => inputRef.current?.click()}
              >
                <Camera size={26} strokeWidth={2} />
                <span>Add photo</span>
              </button>
            )}
          </div>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            style={{ display: 'none' }}
            onChange={(e) => {
              if (e.target.files?.length) void addFiles(e.target.files);
            }}
          />
          <div className="at-note" style={{ marginTop: 2 }}>
            Up to {MAX_PHOTOS} photos. More angles (front, side, close-up) give a better estimate.
          </div>

          <div className="at-field" style={{ marginTop: 8 }}>
            <div className="at-flabel">Notes (optional)</div>
            <input
              className="at-input"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. front-end hit, still driveable"
            />
          </div>

          <button
            type="button"
            className="at-btn primary"
            disabled={busy || photos.length === 0}
            onClick={() => void getEstimate()}
            style={{ marginTop: 4 }}
          >
            <Sparkles size={18} strokeWidth={2.4} />
            {busy ? 'Reading the photos…' : 'Get estimate'}
          </button>
        </>
      )}
    </>
  );
}

/** The editable draft: fixes (read-only scope) + editable parts, labour, rate & materials, live totals. */
function EstimateResultView({
  result,
  onRestart,
}: {
  result: Extract<EstimateResult, { configured: true }>;
  onRestart: () => void;
}) {
  const [parts, setParts] = useState<EstimatePart[]>(result.parts);
  const [labour, setLabour] = useState<EstimateLabour[]>(result.labour);
  const [rate, setRate] = useState<number>(result.labourRateAud);
  const [materials, setMaterials] = useState<number>(result.materialsAud);

  const totals = useMemo(
    () => recompute({ parts, labour, labourRateAud: rate, materialsAud: materials }),
    [parts, labour, rate, materials],
  );

  const setPart = (i: number, patch: Partial<EstimatePart>) =>
    setParts((ps) => ps.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  const setLab = (i: number, patch: Partial<EstimateLabour>) =>
    setLabour((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  return (
    <>
      <div className="at-draftbanner">
        <AlertTriangle size={16} strokeWidth={2.4} />
        <span>{result.disclaimer}</span>
      </div>

      {result.summary && <div className="at-estsummary">{result.summary}</div>}

      {/* What needs fixing — the AI scope. */}
      <div className="at-lbl">What needs fixing</div>
      <div className="at-list">
        {result.fixes.map((f, i) => (
          <div key={i} className="at-lrow" style={{ cursor: 'default' }}>
            <span className={`at-badge ${opColor(f.operation)}`}>
              {OPERATION_LABEL[f.operation]}
            </span>
            <div className="body">
              <div className="ti">{f.panel}</div>
              {f.note && <div className="st">{f.note}</div>}
            </div>
          </div>
        ))}
      </div>

      {/* Parts */}
      <div className="at-lbl" style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span>Parts</span>
        <button
          type="button"
          className="at-addline"
          onClick={() => setParts((p) => [...p, { name: '', quantity: 1, unitPriceAud: 0 }])}
        >
          <Plus size={14} strokeWidth={2.6} /> Add
        </button>
      </div>
      {parts.length === 0 ? (
        <div className="at-estempty">No parts — the panels can be repaired.</div>
      ) : (
        parts.map((p, i) => (
          <div key={i} className="at-estline">
            <input
              className="at-input"
              value={p.name}
              placeholder="Part name"
              onChange={(e) => setPart(i, { name: e.target.value })}
            />
            <input
              className="at-input qty"
              type="number"
              inputMode="numeric"
              value={p.quantity}
              aria-label="Quantity"
              onChange={(e) => setPart(i, { quantity: Number(e.target.value) })}
            />
            <input
              className="at-input money"
              type="number"
              inputMode="decimal"
              value={p.unitPriceAud}
              aria-label="Unit price"
              onChange={(e) => setPart(i, { unitPriceAud: Number(e.target.value) })}
            />
            <button
              type="button"
              className="at-rmline"
              aria-label="Remove part"
              onClick={() => setParts((ps) => ps.filter((_, j) => j !== i))}
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))
      )}

      {/* Labour */}
      <div className="at-lbl" style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span>Labour</span>
        <button
          type="button"
          className="at-addline"
          onClick={() => setLabour((l) => [...l, { task: '', operation: 'repair', hours: 1 }])}
        >
          <Plus size={14} strokeWidth={2.6} /> Add
        </button>
      </div>
      {labour.map((l, i) => (
        <div key={i} className="at-estline">
          <input
            className="at-input"
            value={l.task}
            placeholder="Task"
            onChange={(e) => setLab(i, { task: e.target.value })}
          />
          <input
            className="at-input qty"
            type="number"
            inputMode="decimal"
            value={l.hours}
            aria-label="Hours"
            onChange={(e) => setLab(i, { hours: Number(e.target.value) })}
          />
          <span className="at-esthrs">hrs</span>
          <button
            type="button"
            className="at-rmline"
            aria-label="Remove labour"
            onClick={() => setLabour((ls) => ls.filter((_, j) => j !== i))}
          >
            <Trash2 size={16} />
          </button>
        </div>
      ))}

      <div className="at-estline" style={{ marginTop: 10 }}>
        <span className="at-estlabel">Labour rate ($/hr)</span>
        <input
          className="at-input money"
          type="number"
          inputMode="decimal"
          value={rate}
          aria-label="Labour rate"
          onChange={(e) => setRate(Number(e.target.value))}
        />
      </div>
      <div className="at-estline">
        <span className="at-estlabel">Paint & materials</span>
        <input
          className="at-input money"
          type="number"
          inputMode="decimal"
          value={materials}
          aria-label="Paint and materials"
          onChange={(e) => setMaterials(Number(e.target.value))}
        />
      </div>

      {/* Totals */}
      <div className="at-esttotals">
        <div className="row">
          <span>Parts</span>
          <span>{aud(totals.partsSubtotalAud)}</span>
        </div>
        <div className="row">
          <span>Labour</span>
          <span>{aud(totals.labourSubtotalAud)}</span>
        </div>
        <div className="row">
          <span>Paint &amp; materials</span>
          <span>{aud(materials)}</span>
        </div>
        <div className="row sub">
          <span>Subtotal</span>
          <span>{aud(totals.subtotalAud)}</span>
        </div>
        <div className="row">
          <span>GST (10%)</span>
          <span>{aud(totals.gstAud)}</span>
        </div>
        <div className="row total">
          <span>Estimated total</span>
          <span>{aud(totals.totalAud)}</span>
        </div>
      </div>

      <button type="button" className="at-btn ghost" onClick={onRestart} style={{ marginTop: 14 }}>
        Start a new estimate
      </button>
    </>
  );
}

function opColor(op: string): string {
  return op === 'replace' ? 'red' : op === 'paint' ? 'purple' : 'amber';
}
