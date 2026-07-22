'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Car } from 'lucide-react';
import { api } from '@/lib/api';
import { FleetVehicle, vehicleStatusColor, vehicleStatusLabel } from '@/lib/fleet';
import { useAsync } from '@/components/ui';
import { AtTopbar } from '@/components/autotech/kit';

/** All cars + a rego search — the screen behind "View all cars & search rego". From /fleet/vehicles. */
export function CarsList() {
  const router = useRouter();
  const { data, loading, error } = useAsync(() => api.get<FleetVehicle[]>('/fleet/vehicles'), []);
  const [q, setQ] = useState('');

  const vehicles = data ?? [];
  const shown = useMemo(() => {
    const term = q.trim().toUpperCase();
    if (!term) return vehicles;
    return vehicles.filter(
      (v) =>
        v.rego.includes(term) ||
        v.make.toUpperCase().includes(term) ||
        v.model.toUpperCase().includes(term),
    );
  }, [vehicles, q]);

  return (
    <>
      <AtTopbar backHref="/inout" />
      <div className="at-h2">All cars</div>

      <input
        className="at-input rego"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search rego"
        autoCapitalize="characters"
        style={{ margin: '14px 0' }}
      />

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
