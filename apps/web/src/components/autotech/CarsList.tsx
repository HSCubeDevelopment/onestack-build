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
import { useAsync } from '@/components/ui';
import { AtTopbar } from '@/components/autotech/kit';

type Filter = 'all' | FleetVehicleStatus;
const CHIPS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'available', label: 'Available' },
  { key: 'out', label: 'Out' },
  { key: 'booked', label: 'Booked' },
  { key: 'repair', label: 'In repair' },
  { key: 'unknown', label: 'Review' },
];

/** All cars — rego search + status filter chips with live counts. From /fleet/vehicles. */
export function CarsList() {
  const router = useRouter();
  const { data, loading, error } = useAsync(() => api.get<FleetVehicle[]>('/fleet/vehicles'), []);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  const vehicles = data ?? [];
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const v of vehicles) c[v.status] = (c[v.status] ?? 0) + 1;
    return c;
  }, [vehicles]);
  const countFor = (k: Filter) => (k === 'all' ? vehicles.length : (counts[k] ?? 0));

  const shown = useMemo(() => {
    const term = q.trim().toUpperCase();
    return vehicles
      .filter((v) => (filter === 'all' ? true : v.status === filter))
      .filter((v) =>
        term
          ? v.rego.includes(term) ||
            v.make.toUpperCase().includes(term) ||
            v.model.toUpperCase().includes(term)
          : true,
      );
  }, [vehicles, filter, q]);

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

      {/* Status filter chips — each shows its count (All + any status present). */}
      {!loading && vehicles.length > 0 ? (
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
      ) : null}

      {error && <div className="at-errbanner">Could not load cars.</div>}
      {loading ? (
        <div className="at-spin">Loading…</div>
      ) : shown.length === 0 ? (
        <div className="at-empty">No cars match.</div>
      ) : (
        <div className="at-list">
          {shown.map((v) => (
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
