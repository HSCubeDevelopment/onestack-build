'use client';
import { api } from '@/lib/api';
import { FleetVehicle } from '@/lib/fleet';
import { useAsync } from '@/components/ui';
import { AtTopbar } from '@/components/autotech/kit';
import { CarsBrowser } from '@/components/fleet/CarsBrowser';

/**
 * All cars, staff phone surface. The browser itself is shared with the owner's /fleet screen — see
 * CarsBrowser — so there is exactly one cars screen in the product, wearing two shells.
 */
export function CarsList() {
  const vehicles = useAsync(() => api.get<FleetVehicle[]>('/fleet/vehicles'), []);
  return (
    <>
      <AtTopbar backHref="/inout" />
      <div className="at-h2" style={{ marginBottom: 14 }}>
        All cars
      </div>
      <CarsBrowser
        vehicles={vehicles.data ?? []}
        loading={vehicles.loading}
        error={vehicles.error}
      />
    </>
  );
}
