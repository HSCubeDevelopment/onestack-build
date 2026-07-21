'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronRight, Search } from 'lucide-react';
import { api, Contact, Vehicle, WorkItem } from '@/lib/api';
import { useRole } from '@/lib/use-role';
import { humanizeState, makeModelOf, regoOf, StatePill } from '@/lib/job-display';
import { EmptyState, ErrorBanner, Loading, Modal, PageHead, useAsync } from '@/components/ui';

/**
 * "Cars & jobs" — the prototype's jobs screen.
 *
 * The old version was a five-column spreadsheet with no vehicle, no search and no way to filter by
 * stage — the same job that looked like a car on the home screen looked like a database row here. This
 * is the prototype's model instead: a rego search, a status segment, and rows that lead with the PLATE,
 * because in a workshop the plate is what identifies the car.
 *
 * `?withSubjects=1` gets each job's vehicle label in the one (already staff-scoped) list call, so the
 * rego is real, not stubbed — and a STAFF caller still only ever sees jobs assigned to them.
 */

/** The workflow states, in the order the prototype shows them. "All" first so nothing is hidden. */
const FILTERS = ['All', 'InProgress', 'Booked', 'AwaitingParts', 'Ready', 'Collected'] as const;
type Filter = (typeof FILTERS)[number];

export default function JobsPage() {
  const { isStaff } = useRole();
  const { data, loading, error, reload } = useAsync(
    () =>
      Promise.all([
        api.get<WorkItem[]>('/work-items?type=job&withSubjects=1'),
        api.get<Contact[]>('/contacts'),
      ]),
    [],
  );
  const [showNew, setShowNew] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('All');

  const jobs = useMemo(() => data?.[0] ?? [], [data]);
  const contacts = data?.[1] ?? [];
  const contactName = (id: unknown): string =>
    contacts.find((c) => c.id === id)?.displayName ?? '—';

  // Which stages actually have jobs — a segment for an always-empty stage is just noise.
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const j of jobs) c[j.stateName] = (c[j.stateName] ?? 0) + 1;
    return c;
  }, [jobs]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return jobs.filter((j) => {
      if (filter !== 'All' && j.stateName !== filter) return false;
      if (!q) return true;
      const hay = [j.reference, j.subjectLabel ?? '', contactName(j.fields.customerId)]
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobs, contacts, query, filter]);

  return (
    <>
      <PageHead
        title="Cars & jobs"
        sub={isStaff ? 'Jobs assigned to you' : 'Every car in the workshop'}
      >
        <button className="btn primary" onClick={() => setShowNew(true)}>
          + New job
        </button>
      </PageHead>
      <ErrorBanner message={error} />
      {loading && <Loading />}
      {data && (
        <>
          <label className="search-field">
            <Search size={16} aria-hidden />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search rego, make or customer…"
              autoCapitalize="characters"
              aria-label="Search jobs"
            />
          </label>

          <div className="seg" role="tablist" aria-label="Filter by stage">
            {FILTERS.filter((f) => f === 'All' || counts[f]).map((f) => (
              <button
                key={f}
                role="tab"
                aria-selected={filter === f}
                className={filter === f ? 'on' : ''}
                onClick={() => setFilter(f)}
              >
                {f === 'All' ? 'All' : humanizeState(f)}
                {f !== 'All' && counts[f] ? ` ${counts[f]}` : ''}
              </button>
            ))}
          </div>

          <div className="card">
            {shown.length === 0 ? (
              <EmptyState>
                {jobs.length === 0
                  ? 'No jobs yet. Create your first job to get started.'
                  : 'No cars match this filter.'}
              </EmptyState>
            ) : (
              shown.map((j) => (
                <Link key={j.id} href={`/jobs/${j.id}`} className="job-row">
                  <div className="job-row-main">
                    <span className="avatar" aria-hidden>
                      {makeModelOf(j.subjectLabel)?.[0]?.toUpperCase() ?? '#'}
                    </span>
                    <div style={{ minWidth: 0 }}>
                      <div className="row" style={{ gap: 7 }}>
                        <b style={{ fontSize: 14 }}>{makeModelOf(j.subjectLabel) ?? j.reference}</b>
                        {regoOf(j.subjectLabel) && (
                          <span className="rego-plate">{regoOf(j.subjectLabel)}</span>
                        )}
                      </div>
                      <div className="job-cust">
                        {contactName(j.fields.customerId)}
                        {j.assignees.length === 0 && !isStaff ? ' · unassigned' : ''}
                      </div>
                    </div>
                  </div>
                  <div className="row" style={{ gap: 8, flex: '0 0 auto' }}>
                    <StatePill state={j.stateName} />
                    <ChevronRight size={16} className="more-chev" aria-hidden />
                  </div>
                </Link>
              ))
            )}
          </div>
        </>
      )}
      {showNew && (
        <NewJobModal
          contacts={contacts}
          onClose={() => setShowNew(false)}
          onCreated={() => {
            setShowNew(false);
            void reload();
          }}
        />
      )}
    </>
  );
}

function NewJobModal({
  contacts,
  onClose,
  onCreated,
}: {
  contacts: Contact[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const router = useRouter();
  const [customerId, setCustomerId] = useState('');
  const [vehicleId, setVehicleId] = useState('');
  const [description, setDescription] = useState('');
  const [vehicles, setVehicles] = useState<Vehicle[] | null>(null);
  const [vehiclesLoading, setVehiclesLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function pickCustomer(id: string) {
    setCustomerId(id);
    setVehicleId('');
    setVehicles(null);
    setErr(null);
    if (!id) return;
    setVehiclesLoading(true);
    try {
      const vs = await api.get<Vehicle[]>(`/contacts/${id}/vehicles`);
      setVehicles(vs);
      if (vs.length === 1) setVehicleId(vs[0].id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setVehiclesLoading(false);
    }
  }

  async function submit() {
    setErr(null);
    setSaving(true);
    try {
      const job = await api.post<WorkItem>('/work-items', {
        type: 'job',
        fields: { customerId, description: description || undefined },
        subjectIds: [vehicleId],
      });
      onCreated();
      router.push(`/jobs/${job.id}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  }

  const noVehicles = vehicles !== null && vehicles.length === 0;
  const canSubmit = !!customerId && !!vehicleId && !saving;

  return (
    <Modal title="New job" onClose={onClose}>
      <div className="stack">
        <ErrorBanner message={err} />
        <label className="field">
          Customer
          <select
            className="select"
            value={customerId}
            onChange={(e) => void pickCustomer(e.target.value)}
          >
            <option value="">Select a customer…</option>
            {contacts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.displayName}
              </option>
            ))}
          </select>
        </label>

        {customerId && (
          <label className="field">
            Vehicle
            {vehiclesLoading ? (
              <span className="faint">Loading vehicles…</span>
            ) : noVehicles ? (
              <span className="err">
                This customer has no vehicles. Add a vehicle on the customer page first.
              </span>
            ) : (
              <select
                className="select"
                value={vehicleId}
                onChange={(e) => setVehicleId(e.target.value)}
              >
                <option value="">Select a vehicle…</option>
                {(vehicles ?? []).map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.label}
                  </option>
                ))}
              </select>
            )}
          </label>
        )}

        <label className="field">
          Description
          <textarea
            className="input"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What needs doing?"
          />
        </label>

        <div className="row">
          <div className="spacer" />
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={!canSubmit} onClick={() => void submit()}>
            {saving ? 'Creating…' : 'Create job'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
