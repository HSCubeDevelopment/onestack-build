'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import {
  FleetVehicle,
  FleetVehicleStatus,
  vehicleStatusColor,
  vehicleStatusLabel,
} from '@/lib/fleet';
import { EmptyState, ErrorBanner, Loading, PageHead, useAsync } from '@/components/ui';

const FILTERS: (FleetVehicleStatus | 'all')[] = ['all', 'available', 'out', 'booked', 'repair'];

/** Cars — the fleet list with scope + status filters + search (In N Out "Cars" tab), from /fleet/vehicles. */
export default function CarsPage() {
  const router = useRouter();
  const { data, loading, error } = useAsync(() => api.get<FleetVehicle[]>('/fleet/vehicles'), []);
  const [filter, setFilter] = useState<FleetVehicleStatus | 'all'>('all');
  const [q, setQ] = useState('');

  const vehicles = data ?? [];
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const v of vehicles) c[v.status] = (c[v.status] ?? 0) + 1;
    return c;
  }, [vehicles]);

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
      <PageHead title="Cars" sub="Your fleet — availability at a glance" />
      <ErrorBanner message={error} />

      <label className="search-field" style={{ marginBottom: 12 }}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search rego or make…"
          autoCapitalize="characters"
          aria-label="Search cars"
        />
      </label>

      <div
        className="seg"
        role="tablist"
        aria-label="Filter by status"
        style={{ marginBottom: 12 }}
      >
        {FILTERS.map((f) => (
          <button
            key={f}
            role="tab"
            aria-selected={filter === f}
            className={filter === f ? 'on' : ''}
            onClick={() => setFilter(f)}
          >
            {f === 'all'
              ? `All ${vehicles.length}`
              : `${vehicleStatusLabel[f]}${counts[f] ? ` ${counts[f]}` : ''}`}
          </button>
        ))}
      </div>

      <div className="card">
        {loading ? (
          <Loading />
        ) : shown.length === 0 ? (
          <EmptyState>No cars match.</EmptyState>
        ) : (
          shown.map((v) => (
            <div
              key={v.id}
              className="job-row"
              style={{ cursor: 'pointer' }}
              onClick={() => router.push(`/fleet/history?rego=${encodeURIComponent(v.rego)}`)}
            >
              <div className="job-row-main">
                <span className="avatar" aria-hidden>
                  {v.make?.[0]?.toUpperCase() ?? '#'}
                </span>
                <div style={{ minWidth: 0 }}>
                  <div className="row" style={{ gap: 7 }}>
                    <b style={{ fontSize: 14 }}>
                      {[v.make, v.model].filter(Boolean).join(' ') || v.rego}
                    </b>
                    <span className="rego-plate">{v.rego}</span>
                  </div>
                  {v.vehicleType ? <div className="job-cust">{v.vehicleType}</div> : null}
                </div>
              </div>
              <span className={`badge ${vehicleStatusColor[v.status]}`}>
                {vehicleStatusLabel[v.status]}
              </span>
            </div>
          ))
        )}
      </div>
    </>
  );
}
