'use client';
import { useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowDownLeft, Car, CheckCircle2, Plus } from 'lucide-react';
import { api } from '@/lib/api';
import { FleetDashboardStats } from '@/lib/fleet';
import { activityLabel, QUICK_FLOWS } from '@/lib/inout';
import { ErrorBanner, Loading, useAsync } from '@/components/ui';

interface Activity {
  id: string;
  actorUserId: string | null;
  action: string;
  createdAt: string;
}

/**
 * The In N Out employee HOME (the shop-floor staff landing). Four stat tiles, the primary flow buttons,
 * a ＋ Quick-add sheet with all six flows, and a recent-activity feed — faithful to the legacy app.
 * Reads the Fleet API (dashboard + activity); every flow opens the movement/return form.
 */
export function InOutHome() {
  const { data, loading, error } = useAsync(
    () =>
      Promise.all([
        api.get<FleetDashboardStats>('/fleet/dashboard'),
        api.getOr<Activity[]>('/fleet/activity?limit=8', []),
      ]),
    [],
  );
  const [quickAdd, setQuickAdd] = useState(false);
  const s = data?.[0];
  const activity = data?.[1] ?? [];

  return (
    <>
      <div className="page-head">
        <div>
          <h1 style={{ margin: 0 }}>In N Out</h1>
          <div className="sub">Cars in and out — the shop floor at a glance</div>
        </div>
        <button className="btn primary" onClick={() => setQuickAdd(true)}>
          <Plus size={16} /> Quick add
        </button>
      </div>

      <ErrorBanner message={error} />
      {loading && <Loading />}

      {data && (
        <div className="stack" style={{ gap: 16 }}>
          {/* Stat tiles */}
          <div
            className="grid"
            style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}
          >
            <StatTile n={s?.carsOut} label="Cars out" tint="red" Icon={ArrowUp} />
            <StatTile n={s?.availableCars} label="Available cars" tint="green" Icon={Car} />
            <StatTile
              n={s?.returnedToday}
              label="Returned today"
              tint="blue"
              Icon={ArrowDownLeft}
            />
            <StatTile
              n={s?.needsAttention}
              label="Needs attention"
              tint="amber"
              Icon={AlertTriangle}
            />
          </div>

          {/* Primary flow buttons */}
          <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Link
              href="/inout/new?mode=rent"
              className="btn primary"
              style={{ justifyContent: 'center' }}
            >
              Rent a car out
            </Link>
            <Link href="/inout/return" className="btn" style={{ justifyContent: 'center' }}>
              Record return
            </Link>
            <Link
              href="/inout/new?mode=intake"
              className="btn"
              style={{ justifyContent: 'center' }}
            >
              Customer car intake
            </Link>
            <Link
              href="/inout/new?mode=handback"
              className="btn"
              style={{ justifyContent: 'center' }}
            >
              Give car back
            </Link>
          </div>
          <Link href="/inout/new?mode=full" className="btn" style={{ justifyContent: 'center' }}>
            + New movement
          </Link>

          {/* Recent activity */}
          <div className="card">
            <div className="card-head">
              <h2>Recent activity</h2>
              <Link href="/inout/today" className="view-all">
                Today →
              </Link>
            </div>
            {activity.length === 0 ? (
              <span className="faint" style={{ fontSize: 13 }}>
                Nothing logged yet.
              </span>
            ) : (
              activity.map((a) => (
                <div key={a.id} className="list-row">
                  <span
                    className="list-ico"
                    style={{ background: 'var(--brand-soft)', color: 'var(--brand)' }}
                  >
                    <Car size={15} />
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 550 }}>
                      Someone {activityLabel(a.action)}
                    </div>
                    <div className="faint" style={{ fontSize: 11.5 }}>
                      {timeAgo(a.createdAt)}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {quickAdd && <QuickAddSheet onClose={() => setQuickAdd(false)} />}
    </>
  );
}

function ArrowUp({ size }: { size?: number }) {
  // A simple "out" arrow to match the legacy app's Cars-out tile.
  return <ArrowDownLeft size={size} style={{ transform: 'rotate(180deg)' }} />;
}

function StatTile({
  n,
  label,
  tint,
  Icon,
}: {
  n?: number;
  label: string;
  tint: 'red' | 'green' | 'blue' | 'amber';
  Icon: (p: { size?: number }) => React.ReactNode;
}) {
  const map: Record<string, [string, string]> = {
    red: ['var(--red-soft)', 'var(--red)'],
    green: ['var(--green-soft)', 'var(--green)'],
    blue: ['var(--blue-soft)', 'var(--blue)'],
    amber: ['var(--amber-soft)', 'var(--amber)'],
  };
  const [bg, fg] = map[tint];
  return (
    <div className="kpi-card">
      <div className="kpi-top">
        <span className="kpi-ico" style={{ background: bg, color: fg }}>
          <Icon size={17} />
        </span>
      </div>
      <div className="kpi-value" style={{ color: fg }}>
        {n ?? 0}
      </div>
      <div className="kpi-foot">{label}</div>
    </div>
  );
}

/** The ＋ Quick-add sheet — the six flows, in order. */
function QuickAddSheet({ onClose }: { onClose: () => void }) {
  const tint: Record<string, [string, string]> = {
    brand: ['var(--brand-soft)', 'var(--brand)'],
    green: ['var(--green-soft)', 'var(--green)'],
    red: ['var(--red-soft)', 'var(--red)'],
    amber: ['var(--amber-soft)', 'var(--amber)'],
    blue: ['var(--blue-soft)', 'var(--blue)'],
  };
  return (
    <>
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 60 }}
      />
      <div
        role="dialog"
        aria-label="Quick add"
        className="card"
        style={{
          position: 'fixed',
          left: '50%',
          bottom: 0,
          transform: 'translateX(-50%)',
          width: 'min(520px, 100%)',
          zIndex: 61,
          borderRadius: '18px 18px 0 0',
          padding: 16,
          maxHeight: '85vh',
          overflowY: 'auto',
        }}
      >
        <h2 style={{ margin: '2px 4px 12px' }}>Quick add</h2>
        <div className="stack" style={{ gap: 8 }}>
          {QUICK_FLOWS.map((f) => {
            const [bg, fg] = tint[f.tone];
            return (
              <Link
                key={f.key}
                href={f.href}
                onClick={onClose}
                className="job-row"
                style={{ textDecoration: 'none', color: 'inherit' }}
              >
                <div className="job-row-main">
                  <span className="list-ico" style={{ background: bg, color: fg }}>
                    <CheckCircle2 size={16} />
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <b style={{ fontSize: 14 }}>{f.title}</b>
                    <div className="job-cust">{f.sub}</div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
        <button className="btn" style={{ width: '100%', marginTop: 10 }} onClick={onClose}>
          Cancel
        </button>
      </div>
    </>
  );
}

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  const mins = Math.max(0, Math.round((Date.now() - then) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
}
