'use client';
import { useEffect, useState } from 'react';
import { MapPin, Plus, Trash2 } from 'lucide-react';
import { api, ApiError, getBrowserPosition } from '@/lib/api';
import { useRole } from '@/lib/use-role';
import { nearestYardId, timeSince, Yard, YardDrop } from '@/lib/yards';
import { EmptyState, ErrorBanner, Loading, Modal, PageHead, useAsync } from '@/components/ui';

/**
 * Yards & vehicle logistics (YRD-1). Park an incoming car at one of the shop's yards before a job
 * exists, so every car is traceable from the moment it lands.
 *
 * Reads + the drop/collect flow are open to staff (a floor worker or tow driver parks cars). Managing
 * the yard NETWORK is owner-only, matching the API. The driver's live GPS is used only to pre-select
 * the nearest yard — it is never sent or stored; only the chosen yard, rego and comments are.
 */
export default function YardsPage() {
  const { isStaff } = useRole();
  const isOwner = !isStaff;
  const { data, loading, error, reload } = useAsync(
    () => Promise.all([api.get<Yard[]>('/yards'), api.get<YardDrop[]>('/yards/awaiting')]),
    [],
  );
  const yards = data?.[0] ?? [];
  const awaiting = data?.[1] ?? [];

  const [addingYard, setAddingYard] = useState(false);

  return (
    <>
      <PageHead title="Yards" sub="Cars parked across the yard network, before a job exists">
        {isOwner && (
          <button className="btn primary" onClick={() => setAddingYard(true)}>
            <Plus size={15} /> Add yard
          </button>
        )}
      </PageHead>

      <ErrorBanner message={error} />
      {loading && <Loading />}

      {data && (
        <div className="stack">
          {yards.length === 0 ? (
            <div className="card">
              <EmptyState>
                {isOwner
                  ? 'No yards yet. Add your first yard to start parking cars.'
                  : 'No yards set up yet — ask the owner to add one.'}
              </EmptyState>
            </div>
          ) : (
            <DropForm yards={yards} onDropped={reload} />
          )}

          <AwaitingList awaiting={awaiting} onCollected={reload} />

          {isOwner && yards.length > 0 && (
            <YardNetwork yards={yards} onChanged={reload} onAdd={() => setAddingYard(true)} />
          )}
        </div>
      )}

      {addingYard && (
        <AddYardModal
          onClose={() => setAddingYard(false)}
          onSaved={() => {
            setAddingYard(false);
            void reload();
          }}
        />
      )}
    </>
  );
}

/** Park a car: rego + yard (GPS-nearest pre-selected) + comments. */
function DropForm({ yards, onDropped }: { yards: Yard[]; onDropped: () => void }) {
  const [rego, setRego] = useState('');
  const [yardId, setYardId] = useState(yards[0]?.id ?? '');
  const [comments, setComments] = useState('');
  const [nearestId, setNearestId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Ask the browser where we are ONCE and pre-select the nearest yard. The position is used here and
  // discarded — nothing is sent to the server but the chosen yard id.
  useEffect(() => {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit() {
    setErr(null);
    setSaving(true);
    try {
      await api.post('/yards/drops', {
        yardId,
        rego: rego.trim(),
        comments: comments.trim() || undefined,
      });
      setRego('');
      setComments('');
      onDropped();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Could not park the car');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card">
      <div className="card-head">
        <h2>Drop a car at a yard</h2>
      </div>
      <ErrorBanner message={err} />
      <div className="stack" style={{ gap: 12 }}>
        <label className="field">
          Rego
          <input
            className="input"
            value={rego}
            onChange={(e) => setRego(e.target.value)}
            placeholder="e.g. 7GH 220"
            autoCapitalize="characters"
          />
        </label>
        <label className="field">
          Yard
          <select className="select" value={yardId} onChange={(e) => setYardId(e.target.value)}>
            {yards.map((y) => (
              <option key={y.id} value={y.id}>
                {y.name}
                {y.id === nearestId ? ' — nearest' : ''}
              </option>
            ))}
          </select>
        </label>
        {nearestId && (
          <div className="hintnote" style={{ margin: 0 }}>
            <MapPin size={12} style={{ verticalAlign: '-1px' }} /> Nearest yard pre-selected from
            your location. Your position isn’t stored.
          </div>
        )}
        <label className="field">
          Comments
          <input
            className="input"
            value={comments}
            onChange={(e) => setComments(e.target.value)}
            placeholder="e.g. front-end damage, keys in lockbox"
          />
        </label>
        <button
          className="btn primary"
          disabled={saving || !rego.trim() || !yardId}
          onClick={() => void submit()}
        >
          {saving ? 'Parking…' : 'Park car'}
        </button>
      </div>
    </div>
  );
}

/** The "Awaiting in yards" list — cars currently parked, oldest first. */
function AwaitingList({
  awaiting,
  onCollected,
}: {
  awaiting: YardDrop[];
  onCollected: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function collect(id: string) {
    setErr(null);
    setBusy(id);
    try {
      await api.post(`/yards/drops/${id}/collect`);
      onCollected();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Could not collect the car');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="card">
      <div className="card-head">
        <h2>Awaiting in yards</h2>
        <span className="faint">{awaiting.length}</span>
      </div>
      <ErrorBanner message={err} />
      {awaiting.length === 0 ? (
        <EmptyState>Nothing parked right now.</EmptyState>
      ) : (
        awaiting.map((d) => (
          <div key={d.id} className="job-row">
            <div className="job-row-main">
              <span className="rego-plate">{d.rego}</span>
              <div style={{ minWidth: 0 }}>
                <b style={{ fontSize: 13.5 }}>{d.yardName}</b>
                <div className="job-cust">
                  {timeSince(d.droppedAt)}
                  {d.comments ? ` · ${d.comments}` : ''}
                </div>
              </div>
            </div>
            <button className="btn sm" disabled={busy === d.id} onClick={() => void collect(d.id)}>
              {busy === d.id ? '…' : 'Collect'}
            </button>
          </div>
        ))
      )}
    </div>
  );
}

/** Owner-only: the yard network — list + delete. */
function YardNetwork({
  yards,
  onChanged,
  onAdd,
}: {
  yards: Yard[];
  onChanged: () => void;
  onAdd: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function remove(y: Yard) {
    if (!confirm(`Remove yard "${y.name}"? Cars already parked there stay on record.`)) return;
    setErr(null);
    setBusy(y.id);
    try {
      await api.del(`/yards/${y.id}`);
      onChanged();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Could not remove the yard');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="card">
      <div className="card-head">
        <h2>Yard network</h2>
        <button className="btn sm" onClick={onAdd}>
          <Plus size={14} /> Add
        </button>
      </div>
      <ErrorBanner message={err} />
      {yards.map((y) => (
        <div key={y.id} className="job-row">
          <div className="job-row-main">
            <span className="more-icon" aria-hidden>
              <MapPin size={16} />
            </span>
            <div style={{ minWidth: 0 }}>
              <b style={{ fontSize: 13.5 }}>{y.name}</b>
              <div className="job-cust">
                {y.latitude != null && y.longitude != null
                  ? `${y.latitude.toFixed(4)}, ${y.longitude.toFixed(4)}`
                  : 'No coordinates — set them to enable “nearest yard”'}
              </div>
            </div>
          </div>
          <button
            className="btn danger sm"
            disabled={busy === y.id}
            onClick={() => void remove(y)}
            aria-label={`Remove ${y.name}`}
          >
            <Trash2 size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}

/** Add a yard, optionally capturing the phone's current location as the yard's coordinates. */
function AddYardModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState('');
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function useMyLocation() {
    setLocating(true);
    const pos = await getBrowserPosition();
    setLocating(false);
    if (pos) setCoords({ latitude: pos.latitude, longitude: pos.longitude });
    else setErr('Could not read your location — you can add the yard without it.');
  }

  async function submit() {
    setErr(null);
    setSaving(true);
    try {
      await api.post('/yards', {
        name: name.trim(),
        latitude: coords?.latitude,
        longitude: coords?.longitude,
      });
      onSaved();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Could not add the yard');
      setSaving(false);
    }
  }

  return (
    <Modal title="Add yard" onClose={onClose}>
      <div className="stack">
        <ErrorBanner message={err} />
        <label className="field">
          Yard name
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Fawkner Depot"
          />
        </label>
        <div>
          <button className="btn" disabled={locating} onClick={() => void useMyLocation()}>
            <MapPin size={15} /> {locating ? 'Reading location…' : 'Use my current location'}
          </button>
          {coords && (
            <div className="faint" style={{ marginTop: 6, fontSize: 12 }}>
              Set to {coords.latitude.toFixed(4)}, {coords.longitude.toFixed(4)}
            </div>
          )}
          <div className="faint" style={{ marginTop: 6, fontSize: 12 }}>
            Coordinates let the app suggest this yard when a driver is nearby. Optional.
          </div>
        </div>
        <div className="row">
          <div className="spacer" />
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn primary"
            disabled={saving || !name.trim()}
            onClick={() => void submit()}
          >
            {saving ? 'Adding…' : 'Add yard'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
