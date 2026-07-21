'use client';
import { useState } from 'react';
import Link from 'next/link';
import { api, Lead, LeadForm } from '@/lib/api';
import {
  EmptyState,
  ErrorBanner,
  Loading,
  Modal,
  PageHead,
  StatusBadge,
  useAsync,
} from '@/components/ui';

type Tab = 'leads' | 'forms';

export default function LeadsPage() {
  const [tab, setTab] = useState<Tab>('leads');

  return (
    <>
      <PageHead title="Leads" sub="Enquiries and your public web forms" />
      <div className="tabs">
        <div className={`tab ${tab === 'leads' ? 'active' : ''}`} onClick={() => setTab('leads')}>
          Leads
        </div>
        <div className={`tab ${tab === 'forms' ? 'active' : ''}`} onClick={() => setTab('forms')}>
          Web forms
        </div>
      </div>
      {tab === 'leads' ? <LeadsTab /> : <FormsTab />}
    </>
  );
}

const STATUS_FILTERS = ['All', 'New', 'Contacted', 'Converted'] as const;

function LeadsTab() {
  const [status, setStatus] = useState<(typeof STATUS_FILTERS)[number]>('All');
  const [busy, setBusy] = useState<string | null>(null);

  const { data, loading, error, reload } = useAsync<Lead[]>(
    () => api.get<Lead[]>(`/leads${status === 'All' ? '' : `?status=${status}`}`),
    [status],
  );

  async function markContacted(lead: Lead) {
    setBusy(lead.id);
    try {
      await api.patch(`/leads/${lead.id}/status`, { status: 'Contacted' });
      reload();
    } finally {
      setBusy(null);
    }
  }

  async function convert(lead: Lead) {
    setBusy(lead.id);
    try {
      const res = await api.post<{ lead: Lead; contactId: string }>(`/leads/${lead.id}/convert`);
      window.location.href = `/customers/${res.contactId}`;
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="stack">
      <div className="seg" role="tablist" aria-label="Filter leads by status">
        {STATUS_FILTERS.map((s) => (
          <button
            key={s}
            role="tab"
            aria-selected={status === s}
            className={status === s ? 'on' : ''}
            onClick={() => setStatus(s)}
          >
            {s}
          </button>
        ))}
      </div>

      <ErrorBanner message={error} />
      {loading && <Loading />}

      {data && data.length === 0 && (
        <div className="card">
          <EmptyState>No leads here yet.</EmptyState>
        </div>
      )}

      {data &&
        data.map((lead) => (
          <div className="card" key={lead.id}>
            <div className="row wrap" style={{ justifyContent: 'space-between', marginBottom: 6 }}>
              <b style={{ fontSize: 15 }}>{lead.name}</b>
              <StatusBadge status={lead.status} />
            </div>
            {lead.message && (
              <p className="muted" style={{ fontSize: 13, marginBottom: 8 }}>
                {lead.message}
              </p>
            )}
            <div className="muted" style={{ fontSize: 12.5 }}>
              {lead.phone}
              {lead.email ? ` · ${lead.email}` : ''}
            </div>
            {lead.vehicleInfo && (
              <div className="muted" style={{ fontSize: 12.5 }}>
                🚗 {lead.vehicleInfo}
              </div>
            )}
            <div className="faint" style={{ fontSize: 11.5, marginTop: 4 }}>
              via {lead.source} ·{' '}
              {new Date(lead.createdAt).toLocaleDateString('en-AU', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              })}
            </div>
            <div className="row" style={{ gap: 8, marginTop: 12 }}>
              <div className="spacer" />
              {lead.status === 'Converted' && lead.convertedContactId ? (
                <Link className="btn ghost sm" href={`/customers/${lead.convertedContactId}`}>
                  View customer →
                </Link>
              ) : (
                <>
                  {lead.status === 'New' && (
                    <button
                      className="btn ghost sm"
                      disabled={busy === lead.id}
                      onClick={() => markContacted(lead)}
                    >
                      Mark contacted
                    </button>
                  )}
                  {(lead.status === 'New' || lead.status === 'Contacted') && (
                    <button
                      className="btn primary sm"
                      disabled={busy === lead.id}
                      onClick={() => convert(lead)}
                    >
                      Convert to customer
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        ))}
    </div>
  );
}

function FormsTab() {
  const [creating, setCreating] = useState(false);
  const [testing, setTesting] = useState<LeadForm | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const { data, loading, error, reload } = useAsync<LeadForm[]>(
    () => api.get<LeadForm[]>('/lead-forms'),
    [],
  );

  async function toggle(form: LeadForm) {
    await api.patch(`/lead-forms/${form.id}`, { enabled: !form.enabled });
    reload();
  }

  async function copy(url: string, id: string) {
    await navigator.clipboard.writeText(url);
    setCopied(id);
    setTimeout(() => setCopied((c) => (c === id ? null : c)), 1500);
  }

  return (
    <div className="stack">
      <div className="row">
        <div className="spacer" />
        <button className="btn primary" onClick={() => setCreating(true)}>
          + New form
        </button>
      </div>

      <ErrorBanner message={error} />
      {loading && <Loading />}

      {data && data.length === 0 && (
        <EmptyState>No web forms yet. Create one to start capturing enquiries.</EmptyState>
      )}

      {data && data.length > 0 && (
        <div className="stack">
          {data.map((form) => (
            <div key={form.id} className="card">
              <div className="row wrap">
                <strong>{form.name}</strong>
                <span className={`badge ${form.enabled ? 'green' : ''}`}>
                  {form.enabled ? 'Enabled' : 'Disabled'}
                </span>
                <div className="spacer" />
                <button className="btn ghost sm" onClick={() => setTesting(form)}>
                  Test submit
                </button>
                <button className="btn sm" onClick={() => toggle(form)}>
                  {form.enabled ? 'Disable' : 'Enable'}
                </button>
              </div>
              <div className="row" style={{ marginTop: 10, gap: 8 }}>
                <span className="mono" style={{ wordBreak: 'break-all' }}>
                  {form.embedUrl}
                </span>
                <button className="btn ghost sm" onClick={() => copy(form.embedUrl, form.id)}>
                  {copied === form.id ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {creating && (
        <NewFormModal
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            reload();
          }}
        />
      )}
      {testing && <TestSubmitModal form={testing} onClose={() => setTesting(null)} />}
    </div>
  );
}

function NewFormModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setErr(null);
    try {
      await api.post<LeadForm>('/lead-forms', { name });
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  }

  return (
    <Modal title="New web form" onClose={onClose}>
      <div className="stack" style={{ gap: 12 }}>
        <ErrorBanner message={err} />
        <label className="field">
          Form name
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <div className="row">
          <div className="spacer" />
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={save} disabled={saving || !name}>
            {saving ? 'Creating…' : 'Create form'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function TestSubmitModal({ form, onClose }: { form: LeadForm; onClose: () => void }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit() {
    setSaving(true);
    setErr(null);
    try {
      await api.post(`/public/lead-forms/${form.publicToken}/submit`, {
        name,
        phone,
        message: message || undefined,
      });
      setDone(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={`Test submit — ${form.name}`} onClose={onClose}>
      <div className="stack" style={{ gap: 12 }}>
        <ErrorBanner message={err} />
        {done ? (
          <>
            <div className="badge green" style={{ alignSelf: 'flex-start' }}>
              Lead received — check the Leads tab
            </div>
            <div className="row">
              <div className="spacer" />
              <button className="btn primary" onClick={onClose}>
                Close
              </button>
            </div>
          </>
        ) : (
          <>
            <label className="field">
              Name
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label className="field">
              Phone
              <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </label>
            <label className="field">
              Message (optional)
              <textarea
                className="input"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
            </label>
            <div className="row">
              <div className="spacer" />
              <button className="btn ghost" onClick={onClose}>
                Cancel
              </button>
              <button className="btn primary" onClick={submit} disabled={saving || !name || !phone}>
                {saving ? 'Submitting…' : 'Submit test lead'}
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
