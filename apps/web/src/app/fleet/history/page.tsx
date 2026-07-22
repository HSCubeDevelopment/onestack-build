'use client';
import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { EmptyState, ErrorBanner, Loading, PageHead, useAsync } from '@/components/ui';
import { RentalPeriod, formatDateTime, purposeLabel } from '@/lib/fleet';
import { LiveLocation } from '@/components/LiveLocation';

function HistoryInner() {
  const rego = (useSearchParams().get('rego') ?? '').toUpperCase();
  const { data, loading, error } = useAsync(
    () => api.get<RentalPeriod[]>(`/fleet/vehicles/history?rego=${encodeURIComponent(rego)}`),
    [rego],
  );

  return (
    <>
      <PageHead
        title={`Chain of custody · ${rego || '—'}`}
        sub="Every period this fleet car was out to a client"
      />
      <ErrorBanner message={error} />
      {rego ? <LiveLocation rego={rego} /> : null}
      <div className="card pad0">
        {loading ? (
          <Loading />
        ) : (data ?? []).length === 0 ? (
          <EmptyState>No history for this car.</EmptyState>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Driver</th>
                <th>Out</th>
                <th>Back</th>
                <th>Purpose</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {(data ?? []).map((p) => (
                <tr key={p.id}>
                  <td>
                    {p.driverName || '—'}
                    {p.driverPhone ? <span className="muted"> · {p.driverPhone}</span> : null}
                  </td>
                  <td className="muted">{formatDateTime(p.outAt)}</td>
                  <td className="muted">
                    {p.ongoing ? (
                      <span style={{ color: 'var(--red, #be4152)' }}>Still out</span>
                    ) : (
                      formatDateTime(p.backAt)
                    )}
                  </td>
                  <td>{purposeLabel(p.purpose)}</td>
                  <td className="muted">
                    {[p.notes, p.returnNotes].filter(Boolean).join(' · ') || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

export default function FleetHistoryPage() {
  return (
    <Suspense fallback={<Loading />}>
      <HistoryInner />
    </Suspense>
  );
}
