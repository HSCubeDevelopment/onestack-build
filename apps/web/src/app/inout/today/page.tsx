'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { FleetMovement, FleetReturn, formatDateTime, purposeLabel } from '@/lib/fleet';
import { EmptyState, ErrorBanner, Loading, PageHead, useAsync } from '@/components/ui';

type Tab = 'out' | 'in' | 'returned';

/** Today — cars out / customer cars in / returned, from /fleet/today (In N Out "Today" tab). */
export default function TodayPage() {
  const router = useRouter();
  const { data, loading, error } = useAsync(
    () => api.get<{ movements: FleetMovement[]; returns: FleetReturn[] }>('/fleet/today'),
    [],
  );
  const [tab, setTab] = useState<Tab>('out');

  const movements = useMemo(() => data?.movements ?? [], [data]);
  const returns = useMemo(() => data?.returns ?? [], [data]);

  const carsOut = movements.filter((m) => m.carsOutRego);
  const carsIn = movements.filter((m) => m.carsInRego);

  return (
    <>
      <PageHead title="Today" sub="Everything that moved through the shop today" />
      <ErrorBanner message={error} />

      <div className="seg" role="tablist" aria-label="Today" style={{ marginBottom: 12 }}>
        <button
          role="tab"
          aria-selected={tab === 'out'}
          className={tab === 'out' ? 'on' : ''}
          onClick={() => setTab('out')}
        >
          Cars out {carsOut.length}
        </button>
        <button
          role="tab"
          aria-selected={tab === 'in'}
          className={tab === 'in' ? 'on' : ''}
          onClick={() => setTab('in')}
        >
          Customer cars in {carsIn.length}
        </button>
        <button
          role="tab"
          aria-selected={tab === 'returned'}
          className={tab === 'returned' ? 'on' : ''}
          onClick={() => setTab('returned')}
        >
          Returned {returns.length}
        </button>
      </div>

      <div className="card">
        {loading ? (
          <Loading />
        ) : tab === 'returned' ? (
          returns.length === 0 ? (
            <EmptyState>No returns today.</EmptyState>
          ) : (
            returns.map((r) => (
              <div key={r.id} className="job-row">
                <div className="job-row-main">
                  <span className="rego-plate">{r.returnedRego || '—'}</span>
                  <div style={{ minWidth: 0 }}>
                    <b style={{ fontSize: 13.5 }}>{r.driverName || 'Returned'}</b>
                    <div className="job-cust">{formatDateTime(r.returnedAt)}</div>
                  </div>
                </div>
                <span className="badge green">Returned</span>
              </div>
            ))
          )
        ) : (
          (() => {
            const rows = tab === 'out' ? carsOut : carsIn;
            if (rows.length === 0)
              return (
                <EmptyState>
                  {tab === 'out' ? 'No cars out today.' : 'No customer cars in today.'}
                </EmptyState>
              );
            return rows.map((m) => (
              <div
                key={m.id}
                className="job-row"
                style={{ cursor: 'pointer' }}
                onClick={() => router.push(`/fleet/movements/${m.id}`)}
              >
                <div className="job-row-main">
                  <span className="rego-plate">{tab === 'out' ? m.carsOutRego : m.carsInRego}</span>
                  <div style={{ minWidth: 0 }}>
                    <b style={{ fontSize: 13.5 }}>{m.driverName || '—'}</b>
                    <div className="job-cust">
                      {formatDateTime(m.movedAt)}
                      {m.staffName ? ` · by ${m.staffName}` : ''}
                    </div>
                  </div>
                </div>
                <div className="row" style={{ gap: 6, flex: '0 0 auto' }}>
                  <span className="badge blue">{purposeLabel(m.purpose)}</span>
                  {m.status === 'active' ? <span className="badge red">Out now</span> : null}
                </div>
              </div>
            ));
          })()
        )}
      </div>
    </>
  );
}
