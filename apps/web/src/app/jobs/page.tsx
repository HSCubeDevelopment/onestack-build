'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronRight, Search } from 'lucide-react';
import { api, Contact, Site, Vehicle, WorkItem } from '@/lib/api';
import { useRole } from '@/lib/use-role';
import { useActiveSite } from '@/lib/active-site';
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
        api.get<Site[]>('/sites'),
      ]),
    [],
  );
  const [showNew, setShowNew] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('All');
  // 52.2: the jobs list scopes to the active workshop, shared with the Topbar switcher.
  const [siteFilter, setSiteFilter] = useActiveSite(); // 'all' | siteId | 'none'

  const jobs = useMemo(() => data?.[0] ?? [], [data]);
  const contacts = data?.[1] ?? [];
  const sites = useMemo(() => data?.[2] ?? [], [data]);
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
      if (siteFilter === 'none' && j.siteId) return false;
      if (siteFilter !== 'all' && siteFilter !== 'none' && j.siteId !== siteFilter) return false;
      if (!q) return true;
      const hay = [j.reference, j.subjectLabel ?? '', contactName(j.fields.customerId)]
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobs, contacts, query, filter, siteFilter]);

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

          {/* Location filter — only a multi-site shop needs it (SITE-1). */}
          {sites.length > 0 && (
            <label className="field" style={{ marginBottom: 12 }}>
              Location
              <select
                className="select"
                value={siteFilter}
                onChange={(e) => setSiteFilter(e.target.value)}
                aria-label="Filter by location"
              >
                <option value="all">All locations</option>
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
                <option value="none">No location</option>
              </select>
            </label>
          )}

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
          sites={sites}
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

/**
 * New job in one modal, even for a walk-in the shop has never seen.
 *
 * A job needs a customer AND a car. Rather than sending someone to the Customers page first, both can
 * be created inline: flip to "New customer" and the fields appear; a brand-new customer has no car, so
 * the vehicle fields appear too. On submit the modal creates the contact, then its vehicle, then the
 * job — each on the existing endpoints, in order, so a failure part-way surfaces before the job is made.
 */
function NewJobModal({
  contacts,
  sites,
  onClose,
  onCreated,
}: {
  contacts: Contact[];
  sites: Site[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const router = useRouter();
  const [siteId, setSiteId] = useState(''); // SITE-1: optional location for the job
  // Default to "new customer" when the shop has none yet — otherwise the dropdown is empty and useless.
  const [customerMode, setCustomerMode] = useState<'existing' | 'new'>(
    contacts.length ? 'existing' : 'new',
  );
  const [customerId, setCustomerId] = useState('');
  const [vehicleId, setVehicleId] = useState('');
  const [addingVehicle, setAddingVehicle] = useState(false);
  const [description, setDescription] = useState('');
  const [vehicles, setVehicles] = useState<Vehicle[] | null>(null);
  const [vehiclesLoading, setVehiclesLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // New-customer fields.
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newEmail, setNewEmail] = useState('');
  // New-vehicle fields.
  const [rego, setRego] = useState('');
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [year, setYear] = useState('');

  async function pickCustomer(id: string) {
    setCustomerId(id);
    setVehicleId('');
    setVehicles(null);
    setAddingVehicle(false);
    setErr(null);
    if (!id) return;
    setVehiclesLoading(true);
    try {
      const vs = await api.get<Vehicle[]>(`/contacts/${id}/vehicles`);
      setVehicles(vs);
      if (vs.length === 1) setVehicleId(vs[0].id);
      if (vs.length === 0) setAddingVehicle(true); // no cars on file → go straight to adding one
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setVehiclesLoading(false);
    }
  }

  // A new customer has no cars, so a new vehicle is always required for them.
  const needNewVehicle = customerMode === 'new' || addingVehicle;

  async function submit() {
    setErr(null);
    setSaving(true);
    try {
      // 1. Customer — create it first if this is a new one.
      let cid = customerId;
      if (customerMode === 'new') {
        const c = await api.post<Contact>('/contacts', {
          displayName: newName.trim(),
          phone: newPhone.trim(),
          email: newEmail.trim() || undefined,
        });
        cid = c.id;
      }
      // 2. Vehicle — create it if we're adding one, else use the selected one.
      let vid = vehicleId;
      if (needNewVehicle) {
        const v = await api.post<Vehicle>(`/contacts/${cid}/vehicles`, {
          rego: rego.trim(),
          make: make.trim(),
          model: model.trim(),
          year: Number(year),
        });
        vid = v.id;
      }
      // 3. Job.
      const job = await api.post<WorkItem>('/work-items', {
        type: 'job',
        fields: { customerId: cid, description: description || undefined },
        subjectIds: [vid],
        ...(siteId ? { siteId } : {}),
      });
      onCreated();
      router.push(`/jobs/${job.id}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  }

  const customerReady =
    customerMode === 'new' ? !!newName.trim() && !!newPhone.trim() : !!customerId;
  const vehicleReady = needNewVehicle
    ? !!rego.trim() && !!make.trim() && !!model.trim() && !!year.trim()
    : !!vehicleId;
  const canSubmit = customerReady && vehicleReady && !saving;

  return (
    <Modal title="New job" onClose={onClose}>
      <div className="stack">
        <ErrorBanner message={err} />

        {/* Existing vs new customer */}
        <div className="seg" role="tablist" aria-label="Customer">
          <button
            role="tab"
            aria-selected={customerMode === 'existing'}
            className={customerMode === 'existing' ? 'on' : ''}
            onClick={() => setCustomerMode('existing')}
            disabled={contacts.length === 0}
          >
            Existing customer
          </button>
          <button
            role="tab"
            aria-selected={customerMode === 'new'}
            className={customerMode === 'new' ? 'on' : ''}
            onClick={() => setCustomerMode('new')}
          >
            + New customer
          </button>
        </div>

        {customerMode === 'existing' ? (
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
        ) : (
          <>
            <label className="field">
              Name *
              <input
                className="input"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
            </label>
            <div className="grid cols-2">
              <label className="field">
                Phone *
                <input
                  className="input"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                />
              </label>
              <label className="field">
                Email
                <input
                  className="input"
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                />
              </label>
            </div>
          </>
        )}

        {/* Vehicle — select an existing one, or add a new one (always, for a new customer) */}
        {(customerMode === 'new' || customerId) && (
          <>
            {customerMode === 'existing' && !addingVehicle && (
              <label className="field">
                Vehicle
                {vehiclesLoading ? (
                  <span className="faint">Loading vehicles…</span>
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
                <button
                  type="button"
                  className="link-btn"
                  style={{ marginTop: 6, textAlign: 'left' }}
                  onClick={() => {
                    setAddingVehicle(true);
                    setVehicleId('');
                  }}
                >
                  + Add a new vehicle instead
                </button>
              </label>
            )}

            {needNewVehicle && (
              <div className="stack" style={{ gap: 10 }}>
                <div className="lbl2">NEW VEHICLE</div>
                <div className="grid cols-2">
                  <label className="field">
                    Rego *
                    <input
                      className="input"
                      value={rego}
                      onChange={(e) => setRego(e.target.value)}
                      autoCapitalize="characters"
                    />
                  </label>
                  <label className="field">
                    Year *
                    <input
                      className="input"
                      type="number"
                      value={year}
                      onChange={(e) => setYear(e.target.value)}
                    />
                  </label>
                </div>
                <div className="grid cols-2">
                  <label className="field">
                    Make *
                    <input
                      className="input"
                      value={make}
                      onChange={(e) => setMake(e.target.value)}
                    />
                  </label>
                  <label className="field">
                    Model *
                    <input
                      className="input"
                      value={model}
                      onChange={(e) => setModel(e.target.value)}
                    />
                  </label>
                </div>
                {customerMode === 'existing' && (vehicles?.length ?? 0) > 0 && (
                  <button
                    type="button"
                    className="link-btn"
                    style={{ textAlign: 'left' }}
                    onClick={() => setAddingVehicle(false)}
                  >
                    ← Pick an existing vehicle instead
                  </button>
                )}
              </div>
            )}
          </>
        )}

        {/* Location — only when the shop runs more than one site (SITE-1). Optional. */}
        {sites.length > 0 && (
          <label className="field">
            Location
            <select className="select" value={siteId} onChange={(e) => setSiteId(e.target.value)}>
              <option value="">No location</option>
              {sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
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
