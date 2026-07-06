'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, Contact, Vehicle, WorkItem } from '@/lib/api';
import {
  EmptyState,
  ErrorBanner,
  Loading,
  Modal,
  PageHead,
  StatusBadge,
  useAsync,
} from '@/components/ui';

export default function JobsPage() {
  const { data, loading, error, reload } = useAsync(
    () =>
      Promise.all([
        api.get<WorkItem[]>('/work-items?type=job'),
        api.get<Contact[]>('/contacts'),
      ]),
    [],
  );
  const [showNew, setShowNew] = useState(false);

  const jobs = data?.[0] ?? [];
  const contacts = data?.[1] ?? [];
  const contactName = (id: unknown): string =>
    contacts.find((c) => c.id === id)?.displayName ?? '—';

  return (
    <>
      <PageHead title="Jobs" sub="Every job in the workshop">
        <button className="btn primary" onClick={() => setShowNew(true)}>
          + New job
        </button>
      </PageHead>
      <ErrorBanner message={error} />
      {loading && <Loading />}
      {data && (
        <div className="card pad0">
          {jobs.length === 0 ? (
            <EmptyState>No jobs yet. Create your first job to get started.</EmptyState>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Reference</th>
                  <th>Customer</th>
                  <th>Description</th>
                  <th>Status</th>
                  <th className="right">Assignees</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((j) => (
                  <tr key={j.id} className="clickable">
                    <td>
                      <Link href={`/jobs/${j.id}`} className="mono">
                        {j.reference}
                      </Link>
                    </td>
                    <td>{contactName(j.fields.customerId)}</td>
                    <td className="muted">
                      {(j.fields.description as string) || '—'}
                    </td>
                    <td>
                      <StatusBadge status={j.stateName} />
                    </td>
                    <td className="right">{j.assignees.length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
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
