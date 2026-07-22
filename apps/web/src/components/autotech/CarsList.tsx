'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Car } from 'lucide-react';
import { api } from '@/lib/api';
import {
  FleetVehicle,
  FleetVehicleStatus,
  vehicleStatusColor,
  vehicleStatusLabel,
} from '@/lib/fleet';
import { isActiveFleet } from '@/lib/active-fleet';
import { useAsync } from '@/components/ui';
import { AtTopbar } from '@/components/autotech/kit';

type Filter = 'all' | 'returned' | FleetVehicleStatus;
type Scope = 'fleet' | 'all';
const CHIPS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'available', label: 'Available' },
  { key: 'out', label: 'Out' },
  { key: 'returned', label: 'Returned today' },
  { key: 'booked', label: 'Booked' },
  { key: 'repair', label: 'In repair' },
  { key: 'unknown', label: 'Review' },
];

interface TodayResp {
  returns: { returnedRego: string }[];
}

type SortKey = 'rego' | 'make' | 'status' | 'added';
const SORTS: { value: SortKey; label: string }[] = [
  { value: 'rego', label: 'Rego (A–Z)' },
  { value: 'make', label: 'Make (A–Z)' },
  { value: 'status', label: 'Status' },
  { value: 'added', label: 'Recently added' },
];

/**
 * All cars — Active-fleet/All scope + rego search + status chips with live counts. Mirrors the source
 * In N Out cars screen: "Active fleet" = a company car in the curated allowlist, so the counts match the
 * old system 1:1. From /fleet/vehicles (+ /fleet/today for "Returned today").
 */
export function CarsList() {
  const router = useRouter();
  const { data, loading, error } = useAsync(
    () =>
      Promise.all([
        api.get<FleetVehicle[]>('/fleet/vehicles'),
        api.getOr<TodayResp>('/fleet/today', { returns: [] }),
      ]),
    [],
  );
  const [q, setQ] = useState('');
  const [scope, setScope] = useState<Scope>('fleet');
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<SortKey>('rego');

  const vehicles = data?.[0] ?? [];
  const returnedToday = useMemo(
    () => new Set((data?.[1]?.returns ?? []).map((r) => r.returnedRego).filter(Boolean)),
    [data],
  );

  const fleetCount = useMemo(
    () => vehicles.filter((v) => v.isCompanyCar && isActiveFleet(v.rego)).length,
    [vehicles],
  );
  const scoped = useMemo(
    () =>
      scope === 'all' ? vehicles : vehicles.filter((v) => v.isCompanyCar && isActiveFleet(v.rego)),
    [vehicles, scope],
  );

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const v of scoped) c[v.status] = (c[v.status] ?? 0) + 1;
    return c;
  }, [scoped]);
  const returnedTodayCount = useMemo(
    () => scoped.filter((v) => returnedToday.has(v.rego)).length,
    [scoped, returnedToday],
  );
  const countFor = (k: Filter) =>
    k === 'all' ? scoped.length : k === 'returned' ? returnedTodayCount : (counts[k] ?? 0);

  const shown = useMemo(() => {
    const term = q.trim().toUpperCase();
    return scoped
      .filter((v) =>
        filter === 'all'
          ? true
          : filter === 'returned'
            ? returnedToday.has(v.rego)
            : v.status === filter,
      )
      .filter((v) =>
        term
          ? v.rego.includes(term) ||
            v.make.toUpperCase().includes(term) ||
            v.model.toUpperCase().includes(term)
          : true,
      );
  }, [scoped, filter, q, returnedToday]);

  const sortedShown = useMemo(() => {
    const makeStr = (x: FleetVehicle) => [x.make, x.model].filter(Boolean).join(' ');
    const arr = [...shown];
    switch (sort) {
      case 'make':
        return arr.sort(
          (a, b) => makeStr(a).localeCompare(makeStr(b)) || a.rego.localeCompare(b.rego),
        );
      case 'status':
        return arr.sort((a, b) => a.status.localeCompare(b.status) || a.rego.localeCompare(b.rego));
      case 'added':
        return arr.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      default:
        return arr.sort((a, b) => a.rego.localeCompare(b.rego));
    }
  }, [shown, sort]);

  return (
    <>
      <AtTopbar backHref="/inout" />
      <div className="at-h2">All cars</div>

      <input
        className="at-input rego"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search rego or make"
        autoCapitalize="characters"
        style={{ margin: '14px 0 12px' }}
      />

      {!loading && vehicles.length > 0 ? (
        <>
          {/* Scope: the shop's live active fleet vs every car on record. */}
          <div className="at-chips" role="tablist" aria-label="Scope">
            <button
              type="button"
              className={`at-chip${scope === 'fleet' ? ' on' : ''}`}
              aria-selected={scope === 'fleet'}
              onClick={() => {
                setScope('fleet');
                setFilter('all');
              }}
            >
              Active fleet <span className="n">{fleetCount}</span>
            </button>
            <button
              type="button"
              className={`at-chip${scope === 'all' ? ' on' : ''}`}
              aria-selected={scope === 'all'}
              onClick={() => {
                setScope('all');
                setFilter('all');
              }}
            >
              All <span className="n">{vehicles.length}</span>
            </button>
          </div>

          {/* Status filters, counted within the chosen scope. */}
          <div className="at-chips" role="tablist" aria-label="Filter by status">
            {CHIPS.filter((c) => c.key === 'all' || countFor(c.key) > 0).map((c) => (
              <button
                key={c.key}
                type="button"
                role="tab"
                aria-selected={filter === c.key}
                className={`at-chip${filter === c.key ? ' on' : ''}`}
                onClick={() => setFilter(c.key)}
              >
                {c.label} <span className="n">{countFor(c.key)}</span>
              </button>
            ))}
          </div>

          {/* Sort */}
          <div className="at-sortrow">
            <select
              className="at-sortsel"
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              aria-label="Sort cars"
            >
              {SORTS.map((s) => (
                <option key={s.value} value={s.value}>
                  Sort: {s.label}
                </option>
              ))}
            </select>
          </div>
        </>
      ) : null}

      {error && <div className="at-errbanner">Could not load cars.</div>}
      {loading ? (
        <div className="at-spin">Loading…</div>
      ) : sortedShown.length === 0 ? (
        <div className="at-empty">No cars match.</div>
      ) : (
        <div className="at-list">
          {sortedShown.map((v) => (
            <div
              key={v.id}
              className="at-lrow"
              onClick={() => router.push(`/fleet/history?rego=${encodeURIComponent(v.rego)}`)}
            >
              <span className="ic">
                <Car size={22} strokeWidth={2} color="#fff" />
              </span>
              <div className="body">
                <div className="ti">{v.rego}</div>
                <div className="st">
                  {[v.make, v.model].filter(Boolean).join(' ') || 'Fleet car'}
                </div>
              </div>
              <span className={`at-badge ${vehicleStatusColor[v.status] || 'gray'}`}>
                {vehicleStatusLabel[v.status]}
              </span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
