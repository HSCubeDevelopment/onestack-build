'use client';
import Link from 'next/link';
import { api, Board, Booking, DashboardSummary, Lead, WorkItem, money } from '@/lib/api';
import { ErrorBanner, humanize, Loading, StatusBadge, useAsync } from '@/components/ui';

const STATE_COLOR: Record<string, string> = {
  Booked: '#2563eb',
  InProgress: '#d97706',
  AwaitingParts: '#7c3aed',
  Ready: '#16a34a',
  Collected: '#94a3b8',
};
const STATE_ICON: Record<string, string> = {
  Booked: '📋',
  InProgress: '🔧',
  AwaitingParts: '📦',
  Ready: '✅',
  Collected: '🏁',
};

export default function DashboardPage() {
  const today = new Date();
  const to = new Date(today.getTime() + 30 * 864e5).toISOString();
  const from = new Date(today.getTime() - 864e5).toISOString();

  const { data, loading, error } = useAsync(
    () =>
      Promise.all([
        api.get<DashboardSummary>('/dashboard/summary'),
        api.get<Board>('/board?type=job'),
        api.get<WorkItem[]>('/work-items?type=job'),
        api.get<Lead[]>('/leads'),
        api.get<Booking[]>(`/bookings?from=${from}&to=${to}`).catch(() => [] as Booking[]),
      ]),
    [],
  );

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Good morning, Chirag 👋</h1>
          <div className="sub">
            {today.toLocaleDateString('en-AU', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
          </div>
        </div>
        <button className="btn">⤓ Export report</button>
      </div>
      <ErrorBanner message={error} />
      {loading && <Loading />}
      {data && (
        <Overview
          summary={data[0]}
          board={data[1]}
          jobs={data[2]}
          leads={data[3]}
          bookings={data[4]}
        />
      )}
    </>
  );
}

function Overview({
  summary,
  board,
  jobs,
  leads,
  bookings,
}: {
  summary: DashboardSummary;
  board: Board;
  jobs: WorkItem[];
  leads: Lead[];
  bookings: Booking[];
}) {
  const totalJobs = jobs.length;
  const inProgress = summary.jobsByState['InProgress'] ?? 0;
  const ready = summary.jobsByState['Ready'] ?? 0;
  const newLeads = leads.filter((l) => l.status === 'New').length;

  return (
    <div className="stack">
      {/* KPI row */}
      <div className="grid cols-4">
        <Kpi
          ico="🏢"
          tint="brand"
          title="Total jobs"
          desc="All jobs in the workshop"
          value={String(totalJobs)}
          trend={{ dir: 'up', text: `${inProgress} active` }}
          foot="Across every status"
        />
        <Kpi
          ico="🔧"
          tint="amber"
          title="In progress"
          desc="Being worked on now"
          value={String(inProgress)}
          trend={{ dir: 'flat', text: 'live' }}
          foot="On the shop floor"
        />
        <Kpi
          ico="💰"
          tint="green"
          title="Revenue this week"
          desc="Payments received"
          value={money(summary.thisWeekRevenueCents)}
          trend={{ dir: 'up', text: 'this week' }}
          foot="Since Monday"
        />
        <Kpi
          ico="🧾"
          tint="red"
          title="Total unpaid"
          desc="Outstanding balance"
          value={money(summary.totalUnpaidCents)}
          trend={{ dir: ready > 0 ? 'up' : 'flat', text: `${ready} ready` }}
          foot="Across open invoices"
        />
      </div>

      {/* status row */}
      <div className="grid" style={{ gridTemplateColumns: '1.35fr 1fr' }}>
        <div className="card">
          <div className="card-head">
            <div>
              <h2>Workshop overview</h2>
              <div className="faint" style={{ fontSize: 12, marginTop: 2 }}>
                Jobs currently in each stage
              </div>
            </div>
            <Link href="/board" className="view-all">
              Open board →
            </Link>
          </div>
          <PipelineChart summary={summary} totalJobs={totalJobs} />
        </div>
        <div className="card">
          <div className="card-head">
            <h2>Job status</h2>
            <span className="badge">This month</span>
          </div>
          <StatusDonut summary={summary} totalJobs={totalJobs} />
        </div>
      </div>

      {/* bottom row */}
      <div className="grid cols-3">
        <TasksCard jobs={jobs} />
        <ActivityCard jobs={jobs} leads={leads} />
        <EventsCard bookings={bookings} jobs={jobs} />
      </div>
    </div>
  );
}

function Kpi({
  ico,
  tint,
  title,
  desc,
  value,
  trend,
  foot,
}: {
  ico: string;
  tint: string;
  title: string;
  desc: string;
  value: string;
  trend: { dir: 'up' | 'down' | 'flat'; text: string };
  foot: string;
}) {
  const tints: Record<string, [string, string]> = {
    brand: ['var(--brand-soft)', 'var(--brand)'],
    amber: ['var(--amber-soft)', 'var(--amber)'],
    green: ['var(--green-soft)', 'var(--green)'],
    red: ['var(--red-soft)', 'var(--red)'],
  };
  const [bg, fg] = tints[tint] ?? tints.brand;
  return (
    <div className="kpi-card">
      <div className="kpi-top">
        <span className="kpi-ico" style={{ background: bg, color: fg }}>
          {ico}
        </span>
        <div>
          <div className="kpi-title">{title}</div>
          <div className="kpi-desc">{desc}</div>
        </div>
      </div>
      <div className="kpi-value">
        {value}
        <span className={`trend ${trend.dir}`}>
          {trend.dir === 'up' ? '↑' : trend.dir === 'down' ? '↓' : '•'} {trend.text}
        </span>
      </div>
      <div className="kpi-foot">{foot}</div>
    </div>
  );
}

function PipelineChart({ summary, totalJobs }: { summary: DashboardSummary; totalJobs: number }) {
  const order = ['Booked', 'InProgress', 'AwaitingParts', 'Ready', 'Collected'];
  const states = order.filter((s) => s in summary.jobsByState || true);
  const max = Math.max(1, ...Object.values(summary.jobsByState));
  return (
    <div className="stack" style={{ gap: 18 }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${states.length}, 1fr)`,
          gap: 14,
          alignItems: 'end',
          height: 200,
          padding: '10px 4px 0',
        }}
      >
        {states.map((s) => {
          const n = summary.jobsByState[s] ?? 0;
          const h = Math.max(6, (n / max) * 170);
          return (
            <div key={s} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, height: '100%', justifyContent: 'flex-end' }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--ink)' }}>{n}</div>
              <div
                style={{
                  width: '100%',
                  maxWidth: 46,
                  height: h,
                  borderRadius: 10,
                  background: `linear-gradient(180deg, ${STATE_COLOR[s]}, ${STATE_COLOR[s]}bb)`,
                }}
              />
            </div>
          );
        })}
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${states.length}, 1fr)`,
          gap: 14,
        }}
      >
        {states.map((s) => (
          <div key={s} style={{ textAlign: 'center', fontSize: 11.5, color: 'var(--text-dim)', fontWeight: 550 }}>
            {humanize(s)}
          </div>
        ))}
      </div>
    </div>
  );
}

function StatusDonut({ summary, totalJobs }: { summary: DashboardSummary; totalJobs: number }) {
  const entries = Object.entries(summary.jobsByState).filter(([, n]) => n > 0);
  const total = entries.reduce((s, [, n]) => s + n, 0) || 1;
  const R = 62;
  const C = 2 * Math.PI * R;
  let offset = 0;
  const segs = entries.map(([state, n]) => {
    const frac = n / total;
    const seg = { state, n, color: STATE_COLOR[state] ?? '#94a3b8', dash: frac * C, offset };
    offset += frac * C;
    return seg;
  });

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="row" style={{ gap: 22, justifyContent: 'center' }}>
        <svg width="164" height="164" viewBox="0 0 164 164">
          <g transform="translate(82,82) rotate(-90)">
            <circle r={R} fill="none" stroke="var(--panel-2)" strokeWidth="16" />
            {segs.map((s) => (
              <circle
                key={s.state}
                r={R}
                fill="none"
                stroke={s.color}
                strokeWidth="16"
                strokeDasharray={`${s.dash} ${C - s.dash}`}
                strokeDashoffset={-s.offset}
                strokeLinecap="round"
              />
            ))}
          </g>
          <text x="82" y="76" textAnchor="middle" fontSize="13" fill="var(--text-faint)">
            Total
          </text>
          <text x="82" y="98" textAnchor="middle" fontSize="26" fontWeight="720" fill="var(--ink)">
            {totalJobs}
          </text>
        </svg>
      </div>
      <div className="stack" style={{ gap: 11 }}>
        {segs.map((s) => (
          <div key={s.state} className="pbar">
            <span className="pbar-ico" style={{ background: `${s.color}1a`, color: s.color }}>
              {STATE_ICON[s.state] ?? '•'}
            </span>
            <div style={{ flex: 1 }}>
              <div className="row" style={{ marginBottom: 5 }}>
                <span style={{ fontSize: 12.5, fontWeight: 550 }}>{humanize(s.state)}</span>
                <div className="spacer" />
                <span style={{ fontSize: 12.5, fontWeight: 680 }}>{s.n}</span>
              </div>
              <div className="track">
                <div className="fill" style={{ width: `${(s.n / total) * 100}%`, background: s.color }} />
              </div>
            </div>
          </div>
        ))}
        {segs.length === 0 && <span className="faint">No jobs yet.</span>}
      </div>
    </div>
  );
}

function TasksCard({ jobs }: { jobs: WorkItem[] }) {
  // "Tasks" = jobs that need action next: Booked (start) or Ready (collect).
  const tasks = jobs.filter((j) => j.stateName === 'Booked' || j.stateName === 'Ready').slice(0, 3);
  return (
    <div className="card">
      <div className="card-head">
        <h2>Your tasks</h2>
        <Link href="/jobs" className="view-all">
          View all
        </Link>
      </div>
      <div className="stack" style={{ gap: 12 }}>
        {tasks.length === 0 && <span className="faint" style={{ fontSize: 13 }}>Nothing needs action.</span>}
        {tasks.map((j) => {
          const desc = (j.fields as { description?: string }).description ?? 'Repair job';
          return (
            <div key={j.id} className="task">
              <div className="task-head">
                <span className="list-ico dot-ico">{STATE_ICON[j.stateName] ?? '🔧'}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 640, fontSize: 13.5 }}>{j.reference}</div>
                  <div className="faint" style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {desc}
                  </div>
                </div>
                <StatusBadge status={j.stateName} />
              </div>
              <div className="row">
                <Link href={`/jobs/${j.id}`} className="btn sm" style={{ flex: 1, justifyContent: 'center' }}>
                  Open
                </Link>
                <Link href={`/jobs/${j.id}`} className="btn dark sm" style={{ flex: 1, justifyContent: 'center' }}>
                  {j.stateName === 'Ready' ? 'Collect' : 'Start work'}
                </Link>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ActivityCard({ jobs, leads }: { jobs: WorkItem[]; leads: Lead[] }) {
  const items = [
    ...jobs.slice(0, 3).map((j) => ({
      ico: '🔧',
      title: `${j.reference} — ${(j.fields as { description?: string }).description ?? 'job'}`,
      meta: humanize(j.stateName),
    })),
    ...leads.slice(0, 2).map((l) => ({
      ico: '✉',
      title: `New lead — ${l.name}`,
      meta: l.status,
    })),
  ];
  return (
    <div className="card">
      <div className="card-head">
        <h2>Recent activity</h2>
        <span className="view-all">View all</span>
      </div>
      <div>
        {items.length === 0 && <span className="faint" style={{ fontSize: 13 }}>No recent activity.</span>}
        {items.map((it, i) => (
          <div key={i} className="list-row">
            <span className="list-ico dot-ico">{it.ico}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 550, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {it.title}
              </div>
              <div className="faint" style={{ fontSize: 11.5 }}>{it.meta}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function EventsCard({ bookings, jobs }: { bookings: Booking[]; jobs: WorkItem[] }) {
  const sorted = [...bookings].sort((a, b) => +new Date(a.startsAt) - +new Date(b.startsAt)).slice(0, 4);
  return (
    <div className="card">
      <div className="card-head">
        <h2>Upcoming events</h2>
        <Link href="/calendar" className="view-all">
          View all
        </Link>
      </div>
      <div>
        {sorted.length === 0 && (
          <span className="faint" style={{ fontSize: 13 }}>No bookings scheduled.</span>
        )}
        {sorted.map((b) => {
          const d = new Date(b.startsAt);
          return (
            <div key={b.id} className="list-row">
              <span
                className="list-ico"
                style={{ background: 'var(--brand-soft)', color: 'var(--brand)', flexDirection: 'column', fontSize: 11, fontWeight: 700 }}
              >
                {d.toLocaleDateString('en-AU', { day: '2-digit' })}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 550 }}>{b.title}</div>
                <div className="faint" style={{ fontSize: 11.5 }}>
                  {d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })} ·{' '}
                  {d.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
