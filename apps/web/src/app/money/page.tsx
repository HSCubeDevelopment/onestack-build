'use client';
import { AlertTriangle } from 'lucide-react';
import { AgingBuckets, api, money, MoneyOverview } from '@/lib/api';
import { ErrorBanner, Loading, PageHead, useAsync } from '@/components/ui';

/**
 * Money & Payments (FIN-1). The owner's finance picture: what's owed, what's overdue, what's banked,
 * an aged-receivables split (insurers vs customer excess), an insurer days-to-pay scorecard, and a
 * needs-chasing list. OWNER-only on the API; this page just renders it. Every figure is aggregated
 * from real invoices/payments — nothing here computes new money.
 */
export default function MoneyPage() {
  const { data, loading, error } = useAsync(() => api.get<MoneyOverview>('/finance/overview'), []);

  return (
    <>
      <PageHead
        title="Money & Payments"
        sub="What you're owed, what's overdue, and who's slow to pay"
      />
      <div className="hintnote">🔒 Finance view — visible to owners, hidden from staff.</div>
      <ErrorBanner message={error} />
      {loading && <Loading />}
      {data && <Money o={data} />}
    </>
  );
}

function Money({ o }: { o: MoneyOverview }) {
  return (
    <div className="stack">
      {/* KPIs */}
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
        <MoneyKpi label="Owed to me" value={money(o.owedCents)} tone="var(--ink)" />
        <MoneyKpi label="Overdue" value={money(o.overdueCents)} tone="var(--red)" />
        <MoneyKpi label="Banked (30d)" value={money(o.bankedLast30Cents)} tone="var(--green)" />
        <MoneyKpi
          label="Invoiced, awaiting"
          value={money(o.pipeline.invoicedAwaitingCents)}
          tone="var(--amber)"
        />
      </div>

      {/* Money pipeline */}
      <section className="card">
        <div className="lbl2" style={{ marginBottom: 10 }}>
          MONEY PIPELINE — invoiced vs banked
        </div>
        <PipelineBar
          label="Invoiced · awaiting"
          value={o.pipeline.invoicedAwaitingCents}
          max={Math.max(o.pipeline.invoicedAwaitingCents, o.pipeline.paidLast30Cents, 1)}
          color="var(--amber)"
        />
        <PipelineBar
          label="Paid (30d)"
          value={o.pipeline.paidLast30Cents}
          max={Math.max(o.pipeline.invoicedAwaitingCents, o.pipeline.paidLast30Cents, 1)}
          color="var(--green)"
        />
        <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
          The gap is your insurer lag — money earned and invoiced but still in transit.
        </div>
      </section>

      {/* Aged receivables by payer */}
      <section className="card">
        <div className="lbl2" style={{ marginBottom: 10 }}>
          WHO OWES ME — aged by payer
        </div>
        <PayerAging label="🏢 Insurers" buckets={o.agingByPayer.insurer} />
        <div style={{ height: 14 }} />
        <PayerAging label="👤 Customer excess" buckets={o.agingByPayer.customer} />
      </section>

      {/* Insurer scorecard */}
      <section className="card">
        <div className="lbl2" style={{ marginBottom: 10 }}>
          INSURER SCORECARD — who's slow to pay
        </div>
        {o.insurerScorecard.length === 0 ? (
          <span className="faint">No insurer-billed invoices yet.</span>
        ) : (
          o.insurerScorecard.map((s) => {
            const slow = s.avgDaysToPay != null && s.avgDaysToPay > 45;
            return (
              <div key={s.name} className="job-row">
                <div className="job-row-main">
                  <b style={{ fontSize: 14 }}>{s.name}</b>
                  <span className="job-cust">owed {money(s.owedCents)}</span>
                </div>
                <span
                  className="status-pill"
                  style={{
                    background: slow
                      ? 'var(--red)'
                      : s.avgDaysToPay == null
                        ? 'var(--text-dim)'
                        : 'var(--green)',
                  }}
                >
                  {s.avgDaysToPay == null
                    ? 'no history'
                    : `${s.avgDaysToPay} days${slow ? ' · slow' : ''}`}
                </span>
              </div>
            );
          })
        )}
      </section>

      {/* Needs chasing */}
      <section className="card">
        <div className="lbl2" style={{ marginBottom: 10 }}>
          NEEDS CHASING
        </div>
        {o.needsChasing.overdueCount === 0 && o.needsChasing.uncollectedExcessCents === 0 ? (
          <span className="faint">Nothing overdue. Nicely on top of it.</span>
        ) : (
          <>
            {o.needsChasing.overdueCount > 0 && (
              <div className="chase-row">
                <AlertTriangle size={15} style={{ color: 'var(--red)' }} />
                <span style={{ flex: 1 }}>Overdue invoices</span>
                <span className="status-pill" style={{ background: 'var(--red)' }}>
                  {o.needsChasing.overdueCount} · {money(o.needsChasing.overdueCents)}
                </span>
              </div>
            )}
            {o.needsChasing.uncollectedExcessCents > 0 && (
              <div className="chase-row">
                <AlertTriangle size={15} style={{ color: 'var(--amber)' }} />
                <span style={{ flex: 1 }}>Customer money outstanding (incl. excess)</span>
                <span className="status-pill" style={{ background: 'var(--amber)' }}>
                  {money(o.needsChasing.uncollectedExcessCents)}
                </span>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}

function MoneyKpi({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="kpi-card">
      <div className="kpi-value" style={{ color: tone }}>
        {value}
      </div>
      <div className="kpi-foot">{label}</div>
    </div>
  );
}

function PipelineBar({
  label,
  value,
  max,
  color,
}: {
  label: string;
  value: number;
  max: number;
  color: string;
}) {
  const pct = Math.max(4, Math.round((value / max) * 100));
  return (
    <div style={{ marginBottom: 8 }}>
      <div
        style={{
          background: color,
          color: '#fff',
          borderRadius: 7,
          padding: '6px 10px',
          fontWeight: 800,
          fontSize: 12,
          display: 'flex',
          justifyContent: 'space-between',
          width: `${pct}%`,
          minWidth: 'max-content',
        }}
      >
        <span>{label}</span>
        <span style={{ marginLeft: 12 }}>{money(value)}</span>
      </div>
    </div>
  );
}

const BUCKETS: { key: keyof AgingBuckets; label: string; bg: string; fg: string }[] = [
  { key: 'd0_30', label: '0–30', bg: 'var(--green-soft)', fg: 'var(--green)' },
  { key: 'd30_60', label: '30–60', bg: 'var(--amber-soft)', fg: 'var(--amber)' },
  { key: 'd60_90', label: '60–90', bg: 'var(--red-soft)', fg: 'var(--red)' },
  { key: 'd90_plus', label: '90+', bg: 'var(--red-soft)', fg: 'var(--red)' },
];

function PayerAging({ label, buckets }: { label: string; buckets: AgingBuckets }) {
  const total = buckets.d0_30 + buckets.d30_60 + buckets.d60_90 + buckets.d90_plus;
  return (
    <div>
      <div
        className="spread"
        style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 13 }}
      >
        <span>{label}</span>
        <span>{money(total)}</span>
      </div>
      <div style={{ display: 'flex', gap: 5, marginTop: 6 }}>
        {BUCKETS.map((b) => (
          <div
            key={b.key}
            style={{
              flex: 1,
              textAlign: 'center',
              borderRadius: 8,
              padding: '6px 2px',
              fontSize: 10.5,
              fontWeight: 800,
              lineHeight: 1.3,
              background: b.bg,
              color: b.fg,
            }}
          >
            {b.label}
            <br />
            {money(buckets[b.key])}
          </div>
        ))}
      </div>
    </div>
  );
}
