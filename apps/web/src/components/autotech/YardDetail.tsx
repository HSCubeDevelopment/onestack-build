'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Car, ArrowRight, ChevronRight, Satellite } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { timeSince, Yard, YardDrop, type YardSighting } from '@/lib/yards';
import { FleetVehicle } from '@/lib/fleet';
import { normRego, vehiclesByRego } from '@/lib/fleet-cache';
import { useYardTags } from '@/lib/use-yard-tags';
import { useAsync } from '@/components/ui';
import { AtTopbar } from '@/components/autotech/kit';

/**
 * What is in one yard.
 *
 * Two different answers, shown together because they disagree and the disagreement is the useful part:
 *
 *   Here now  — cars a tracker physically places in this yard. This is reality.
 *   Logged    — drops someone recorded through Park-a-car. This is the shop's paperwork.
 *
 * Before this, the screen showed only the second, so a yard the home screen had just described as
 * holding fifteen cars opened onto "No cars parked here right now". Every rego opens the car's record.
 */
export function YardDetail({ yardId }: { yardId: string }) {
  const router = useRouter();
  const { data, loading, error, reload } = useAsync(
    () => Promise.all([api.get<Yard[]>('/yards'), api.get<YardDrop[]>('/yards/awaiting')]),
    [],
  );
  const yards = useMemo(() => data?.[0] ?? [], [data]);
  const yard = yards.find((y) => y.id === yardId);
  const parked = (data?.[1] ?? []).filter((d) => d.yardId === yardId);

  const tags = useYardTags(yards);
  const here = tags.sightingsByYard[yardId] ?? [];

  // Rego -> car, so a row can say "TOYOTA CAMRY" instead of only a plate. Shared cache: the rego
  // suggestions already load this list, so walking in from a search costs nothing.
  const [byRego, setByRego] = useState<Map<string, FleetVehicle>>(new Map());
  useEffect(() => {
    let alive = true;
    void vehiclesByRego().then((m) => alive && setByRego(m));
    return () => {
      alive = false;
    };
  }, []);

  const [busy, setBusy] = useState<string | null>(null);
  const [moveErr, setMoveErr] = useState<string | null>(null);

  async function moveToWorkshop(id: string) {
    setMoveErr(null);
    setBusy(id);
    try {
      await api.post(`/yards/drops/${id}/collect`);
      await reload();
    } catch (e) {
      setMoveErr(e instanceof ApiError ? e.message : 'Could not move the car');
    } finally {
      setBusy(null);
    }
  }

  const open = (rego: string) => router.push(`/fleet/history?rego=${encodeURIComponent(rego)}`);

  // A car that is both tracked here and logged here is one car — don't list it twice.
  const loggedRegos = new Set(parked.map((d) => normRego(d.rego)));

  return (
    <>
      <AtTopbar backHref="/inout/yards" />
      <div className="at-h2">{yard?.name ?? 'Yard'}</div>

      {(error || moveErr) && (
        <div className="at-errbanner">{moveErr ?? 'Could not load the yard.'}</div>
      )}

      {/* ---- where the cars actually are ---- */}
      <div className="yd-sec">
        <Satellite size={14} />
        Here now
        <span className="n">{tags.loading ? '…' : here.length}</span>
      </div>

      {tags.loading ? (
        <div className="at-spin">Finding the cars…</div>
      ) : !tags.configured ? (
        <div className="at-empty">
          No trackers are set up, so we cannot see what is in the yard.
        </div>
      ) : here.length === 0 ? (
        <div className="at-empty">No tracked cars are sitting here right now.</div>
      ) : (
        <div className="at-list">
          {here.map((s) => (
            <TrackedRow
              key={`${s.tag.rego}-${s.tag.lat},${s.tag.lng}`}
              sighting={s}
              vehicle={byRego.get(normRego(s.tag.rego))}
              alsoLogged={loggedRegos.has(normRego(s.tag.rego))}
              onOpen={() => open(s.tag.rego)}
            />
          ))}
        </div>
      )}

      {/* ---- what the shop wrote down ---- */}
      <div className="yd-sec">
        Logged in <span className="n">{parked.length}</span>
      </div>

      {loading ? (
        <div className="at-spin">Loading…</div>
      ) : parked.length === 0 ? (
        <div className="at-empty">
          Nothing logged here. Cars above were found by their tracker, not by someone parking them
          in.
        </div>
      ) : (
        <div className="at-list">
          {parked.map((d) => (
            <div key={d.id} className="at-lrow">
              <span
                className="ic"
                role="button"
                tabIndex={0}
                onClick={() => open(d.rego)}
                onKeyDown={(e) => e.key === 'Enter' && open(d.rego)}
              >
                <Car size={22} strokeWidth={2} color="#fff" />
              </span>
              <div
                className="body"
                role="button"
                tabIndex={0}
                onClick={() => open(d.rego)}
                onKeyDown={(e) => e.key === 'Enter' && open(d.rego)}
              >
                <div className="ti">{d.rego}</div>
                <div className="st">
                  {timeSince(d.droppedAt)}
                  {d.comments ? ` · ${d.comments}` : ''}
                </div>
              </div>
              <button
                type="button"
                className="at-rowbtn"
                disabled={busy === d.id}
                onClick={() => void moveToWorkshop(d.id)}
              >
                {busy === d.id ? '…' : 'To workshop'}
                {busy === d.id ? null : <ArrowRight size={15} strokeWidth={2.5} />}
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

/** One car a tracker places in this yard. Tapping it opens the car's record. */
function TrackedRow({
  sighting,
  vehicle,
  alsoLogged,
  onOpen,
}: {
  sighting: YardSighting;
  vehicle: FleetVehicle | undefined;
  alsoLogged: boolean;
  onOpen: () => void;
}) {
  const { tag, metresAway, ageHours, ambiguousWith } = sighting;
  const age =
    ageHours == null
      ? 'never reported'
      : ageHours < 1
        ? 'just now'
        : ageHours < 24
          ? `${Math.round(ageHours)}h ago`
          : `${Math.round(ageHours / 24)}d ago`;

  return (
    <div
      className="at-lrow"
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
    >
      <span className="ic" style={{ background: 'var(--at-teal)' }}>
        <Car size={22} strokeWidth={2} color="#fff" />
      </span>
      <div className="body">
        <div className="ti">{tag.rego}</div>
        <div className="st">
          {[vehicle?.make, vehicle?.model].filter(Boolean).join(' ') || 'Tracked car'}
          {` · seen ${age}`}
          {metresAway > 0 ? ` · ${Math.round(metresAway)} m` : ''}
          {alsoLogged ? ' · logged in' : ''}
        </div>
        {/*
          Yards here sit as little as 18 m apart, well inside the error of a crowd-sourced tag, so a
          car near the boundary genuinely cannot be assigned to one of them. Say so on the row rather
          than picking one silently and letting someone walk to the wrong yard.
        */}
        {ambiguousWith && <div className="yd-warn">could also be {ambiguousWith}</div>}
      </div>
      <ChevronRight size={18} strokeWidth={2.5} style={{ opacity: 0.35, flex: 'none' }} />
    </div>
  );
}
