'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search as SearchIcon } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { FleetSearchResults, purposeLabel } from '@/lib/fleet';
import { EmptyState, ErrorBanner, PageHead } from '@/components/ui';

/** Search — any car by rego, driver or phone (In N Out "Search" tab), from /fleet/search. */
export default function InOutSearchPage() {
  const router = useRouter();
  const [term, setTerm] = useState('');
  const [res, setRes] = useState<FleetSearchResults | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function run() {
    if (!term.trim()) {
      setRes(null);
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      setRes(
        await api.get<FleetSearchResults>(`/fleet/search?q=${encodeURIComponent(term.trim())}`),
      );
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Search failed');
    } finally {
      setBusy(false);
    }
  }

  const total = res
    ? res.movements.length + res.returns.length + res.vehicles.length + res.bookings.length
    : 0;

  return (
    <>
      <PageHead title="Search" sub="Any car — by rego, driver or phone" />
      <label className="search-field" style={{ marginBottom: 12 }}>
        <SearchIcon size={16} aria-hidden />
        <input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void run()}
          placeholder="Rego, driver or phone"
          autoCapitalize="characters"
          aria-label="Search"
        />
      </label>
      <button
        className="btn primary"
        style={{ width: '100%', marginBottom: 12 }}
        onClick={() => void run()}
        disabled={busy}
      >
        {busy ? 'Searching…' : 'Search'}
      </button>

      <ErrorBanner message={err} />

      {res ? (
        <div className="card">
          {total === 0 ? (
            <EmptyState>No matches for “{term}”.</EmptyState>
          ) : (
            <>
              {res.movements.map((m) => (
                <div
                  key={`m${m.id}`}
                  className="job-row"
                  style={{ cursor: 'pointer' }}
                  onClick={() => router.push(`/fleet/movements/${m.id}`)}
                >
                  <div className="job-row-main">
                    <span className="rego-plate">{m.carsOutRego || m.carsInRego || '—'}</span>
                    <div style={{ minWidth: 0 }}>
                      <b style={{ fontSize: 13.5 }}>{m.driverName || '—'}</b>
                      <div className="job-cust">{purposeLabel(m.purpose)}</div>
                    </div>
                  </div>
                  <span className="badge blue">Movement</span>
                </div>
              ))}
              {res.returns.map((r) => (
                <div key={`r${r.id}`} className="job-row">
                  <div className="job-row-main">
                    <span className="rego-plate">{r.returnedRego || '—'}</span>
                    <div style={{ minWidth: 0 }}>
                      <b style={{ fontSize: 13.5 }}>{r.driverName || '—'}</b>
                    </div>
                  </div>
                  <span className="badge green">Return</span>
                </div>
              ))}
              {res.vehicles.map((v) => (
                <div key={`v${v.id}`} className="job-row">
                  <div className="job-row-main">
                    <span className="rego-plate">{v.rego}</span>
                    <div style={{ minWidth: 0 }}>
                      <b style={{ fontSize: 13.5 }}>
                        {[v.make, v.model].filter(Boolean).join(' ') || '—'}
                      </b>
                    </div>
                  </div>
                  <span className="badge">Vehicle</span>
                </div>
              ))}
              {res.bookings.map((b) => (
                <div key={`b${b.id}`} className="job-row">
                  <div className="job-row-main">
                    <span className="rego-plate">{b.vehicleRego || '—'}</span>
                    <div style={{ minWidth: 0 }}>
                      <b style={{ fontSize: 13.5 }}>{b.bookingName || '—'}</b>
                    </div>
                  </div>
                  <span className="badge amber">Booking</span>
                </div>
              ))}
            </>
          )}
        </div>
      ) : (
        <div className="card">
          <EmptyState>Type a rego to see its full history.</EmptyState>
        </div>
      )}
    </>
  );
}
