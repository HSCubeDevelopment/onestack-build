'use client';
import Link from 'next/link';
import { api, Board, DashboardSummary, money } from '@/lib/api';
import { ErrorBanner, humanize, Loading, PageHead, StatusBadge, useAsync } from '@/components/ui';

export default function DashboardPage() {
  const { data, loading, error } = useAsync(
    () =>
      Promise.all([
        api.get<DashboardSummary>('/dashboard/summary'),
        api.get<Board>('/board?type=job'),
      ]),
    [],
  );

  return (
    <>
      <PageHead title="Dashboard" sub="Your workshop at a glance" />
      <ErrorBanner message={error} />
      {loading && <Loading />}
      {data && (
        <Dashboard summary={data[0]} board={data[1]} />
      )}
    </>
  );
}

function Dashboard({ summary, board }: { summary: DashboardSummary; board: Board }) {
  const inProgress = summary.jobsByState['InProgress'] ?? 0;
  const ready = summary.jobsByState['Ready'] ?? 0;
  const weekStart = new Date(summary.weekStart).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
  });

  return (
    <div className="stack">
      <div className="grid cols-4">
        <Kpi label="Active jobs" value={String(summary.activeJobs)} />
        <Kpi label="In progress" value={String(inProgress)} />
        <Kpi label="Ready for collection" value={String(ready)} accent="green" />
        <Kpi label="Total unpaid" value={money(summary.totalUnpaidCents)} accent="amber" />
      </div>
      <div className="grid cols-2">
        <div className="card">
          <div className="kpi">
            <span className="label">Revenue this week (from {weekStart})</span>
            <span className="value" style={{ color: 'var(--green)' }}>
              {money(summary.thisWeekRevenueCents)}
            </span>
          </div>
        </div>
        <div className="card">
          <h3 style={{ marginBottom: 12 }}>Jobs by status</h3>
          {Object.keys(summary.jobsByState).length === 0 ? (
            <span className="faint">No jobs yet.</span>
          ) : (
            <div className="stack" style={{ gap: 8 }}>
              {Object.entries(summary.jobsByState).map(([state, n]) => (
                <div key={state} className="row">
                  <StatusBadge status={state} />
                  <div className="spacer" />
                  <strong>{n}</strong>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="card pad0">
        <div className="row" style={{ padding: '14px 18px' }}>
          <h2>Job board</h2>
          <div className="spacer" />
          <Link className="btn sm" href="/board">
            Open board →
          </Link>
        </div>
        <div className="divider" />
        <div style={{ padding: 16 }}>
          <div className="grid cols-4" style={{ gap: 10 }}>
            {board.columns
              .filter((c) => !c.isFinal)
              .map((col) => (
                <div key={col.state}>
                  <div className="row" style={{ marginBottom: 8 }}>
                    <StatusBadge status={col.state} />
                    <span className="faint">{col.cards.length}</span>
                  </div>
                  <div className="stack" style={{ gap: 7 }}>
                    {col.cards.slice(0, 4).map((c) => (
                      <Link
                        key={c.id}
                        href={`/jobs/${c.id}`}
                        className="job-card"
                        style={{ cursor: 'pointer', display: 'block' }}
                      >
                        <div className="ref">{c.reference}</div>
                        <div style={{ fontSize: 12 }}>{c.customerName ?? '—'}</div>
                        <div className="faint" style={{ fontSize: 11 }}>
                          {c.vehicleLabel ?? ''}
                        </div>
                      </Link>
                    ))}
                    {col.cards.length === 0 && (
                      <span className="faint" style={{ fontSize: 12 }}>
                        Nothing here
                      </span>
                    )}
                  </div>
                </div>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value, accent }: { label: string; value: string; accent?: string }) {
  const color = accent === 'green' ? 'var(--green)' : accent === 'amber' ? 'var(--amber)' : undefined;
  return (
    <div className="card">
      <div className="kpi">
        <span className="label">{label}</span>
        <span className="value" style={color ? { color } : undefined}>
          {value}
        </span>
      </div>
    </div>
  );
}
