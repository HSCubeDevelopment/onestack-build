'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { MapPin, CheckCircle2 } from 'lucide-react';
import { api, ApiError, getBrowserPosition } from '@/lib/api';
import { nearestYardId, Yard } from '@/lib/yards';
import { useAsync } from '@/components/ui';
import { AtTopbar } from '@/components/autotech/kit';

/**
 * Park a car at a yard — the employee-side drop flow. Choose the yard (the nearest is pre-selected from
 * the phone's location, which is used here and discarded — only the chosen yard, rego and comments are
 * sent), enter the rego, and park it. The car then appears in that yard's list until someone moves it to
 * the workshop.
 */
export function ParkCarForm() {
  const { data: yards, loading, error } = useAsync(() => api.get<Yard[]>('/yards'), []);

  const [rego, setRego] = useState('');
  const [yardId, setYardId] = useState('');
  const [comments, setComments] = useState('');
  const [nearestId, setNearestId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<{ yardId: string; yardName: string; rego: string } | null>(null);

  // Default the yard to the first one as soon as the list loads.
  useEffect(() => {
    if (yards && yards.length > 0 && !yardId) setYardId(yards[0].id);
  }, [yards, yardId]);

  // Ask the browser where we are ONCE and pre-select the nearest yard. Position is used here and
  // discarded — nothing is sent to the server but the chosen yard id.
  useEffect(() => {
    if (!yards || yards.length === 0) return;
    let alive = true;
    void getBrowserPosition().then((pos) => {
      if (!alive || !pos) return;
      const id = nearestYardId(yards, pos);
      if (id) {
        setNearestId(id);
        setYardId(id);
      }
    });
    return () => {
      alive = false;
    };
  }, [yards]);

  async function submit() {
    setErr(null);
    setSaving(true);
    try {
      await api.post('/yards/drops', {
        yardId,
        rego: rego.trim(),
        comments: comments.trim() || undefined,
      });
      const y = (yards ?? []).find((x) => x.id === yardId);
      setDone({ yardId, yardName: y?.name ?? 'the yard', rego: rego.trim().toUpperCase() });
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Could not park the car');
      setSaving(false);
    }
  }

  if (done) {
    return (
      <>
        <AtTopbar backHref="/inout/yards" />
        <div className="at-done">
          <CheckCircle2 size={56} strokeWidth={2} color="var(--at-green)" />
          <div className="at-done-t">Car parked</div>
          <div className="at-done-s">
            {done.rego} is now parked at {done.yardName}.
          </div>
          <Link
            href={`/inout/yards/${done.yardId}`}
            className="at-btn primary"
            style={{ marginTop: 18 }}
          >
            View {done.yardName}
          </Link>
          <Link href="/inout/yards" className="at-btn ghost" style={{ marginTop: 10 }}>
            Back to yards
          </Link>
        </div>
      </>
    );
  }

  return (
    <>
      <AtTopbar backHref="/inout/yards" />
      <div className="at-h2">Park a car</div>

      {error && <div className="at-errbanner">Could not load yards.</div>}
      {err && <div className="at-errbanner">{err}</div>}

      {loading ? (
        <div className="at-spin">Loading…</div>
      ) : (yards ?? []).length === 0 ? (
        <div className="at-empty">No yards set up yet — ask the owner to add one.</div>
      ) : (
        <>
          <div className="at-field">
            <div className="at-flabel">Rego</div>
            <input
              className="at-input rego"
              value={rego}
              onChange={(e) => setRego(e.target.value)}
              placeholder="e.g. 7GH 220"
              autoCapitalize="characters"
            />
          </div>

          <div className="at-field">
            <div className="at-flabel">Yard</div>
            <select className="at-input" value={yardId} onChange={(e) => setYardId(e.target.value)}>
              {(yards ?? []).map((y) => (
                <option key={y.id} value={y.id}>
                  {y.name}
                  {y.id === nearestId ? ' — nearest' : ''}
                </option>
              ))}
            </select>
          </div>

          {nearestId && (
            <div className="at-note">
              <MapPin size={12} style={{ verticalAlign: '-1px' }} /> Nearest yard pre-selected from
              your location. Your position isn’t stored.
            </div>
          )}

          <div className="at-field">
            <div className="at-flabel">Comments</div>
            <input
              className="at-input"
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              placeholder="e.g. front-end damage, keys in lockbox"
            />
          </div>

          <button
            type="button"
            className="at-btn primary"
            disabled={saving || !rego.trim() || !yardId}
            onClick={() => void submit()}
            style={{ marginTop: 8 }}
          >
            {saving ? 'Parking…' : 'Park car'}
          </button>
        </>
      )}
    </>
  );
}
