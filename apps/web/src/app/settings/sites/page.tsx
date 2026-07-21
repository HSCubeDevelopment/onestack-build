'use client';
import { useState } from 'react';
import { Building2, Pencil, Plus, Trash2 } from 'lucide-react';
import { api, ApiError, Site } from '@/lib/api';
import { useRole } from '@/lib/use-role';
import { EmptyState, ErrorBanner, Loading, Modal, PageHead, useAsync } from '@/components/ui';

/**
 * Multi-site (SITE-1). Manage the shop's locations/branches. A job optionally belongs to a site, so an
 * owner running more than one location can filter work and see per-site counts on the dashboard.
 * Managing the network is OWNER-only, matching the API (creates/edits/deletes 403 for staff).
 */
export default function SitesPage() {
  const { isStaff } = useRole();
  const { data, loading, error, reload } = useAsync(() => api.get<Site[]>('/sites'), []);
  const sites = data ?? [];
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Site | null>(null);

  return (
    <>
      <PageHead title="Sites" sub="Your shop's locations — tag jobs to a branch and track each one">
        {!isStaff && (
          <button className="btn primary" onClick={() => setAdding(true)}>
            <Plus size={15} /> Add site
          </button>
        )}
      </PageHead>

      <ErrorBanner message={error} />
      {loading && <Loading />}

      {data && (
        <div className="card">
          {sites.length === 0 ? (
            <EmptyState>
              {isStaff
                ? 'No sites set up yet — ask the owner to add one.'
                : 'No sites yet. Add your locations to tag jobs by branch.'}
            </EmptyState>
          ) : (
            sites.map((s) => (
              <div key={s.id} className="job-row">
                <div className="job-row-main">
                  <span className="more-icon" aria-hidden>
                    <Building2 size={16} />
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <b style={{ fontSize: 13.5 }}>
                      {s.name}
                      {s.code ? (
                        <span className="badge" style={{ marginLeft: 8 }}>
                          {s.code}
                        </span>
                      ) : null}
                    </b>
                    <div className="job-cust">{s.address || 'No address set'}</div>
                  </div>
                </div>
                {!isStaff && (
                  <div className="row" style={{ gap: 6 }}>
                    <button
                      className="btn sm"
                      onClick={() => setEditing(s)}
                      aria-label={`Edit ${s.name}`}
                    >
                      <Pencil size={14} />
                    </button>
                    <DeleteButton site={s} onDeleted={reload} />
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {adding && (
        <SiteModal
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            void reload();
          }}
        />
      )}
      {editing && (
        <SiteModal
          site={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void reload();
          }}
        />
      )}
    </>
  );
}

function DeleteButton({ site, onDeleted }: { site: Site; onDeleted: () => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function remove() {
    if (!confirm(`Remove site "${site.name}"? Jobs already tagged to it stay on record.`)) return;
    setErr(null);
    setBusy(true);
    try {
      await api.del(`/sites/${site.id}`);
      onDeleted();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Could not remove the site');
      setBusy(false);
    }
  }

  return (
    <>
      <button
        className="btn danger sm"
        disabled={busy}
        onClick={() => void remove()}
        aria-label={`Remove ${site.name}`}
      >
        <Trash2 size={14} />
      </button>
      <ErrorBanner message={err} />
    </>
  );
}

/** Add or edit a site. Name is required; code (a short badge) and address are optional. */
function SiteModal({
  site,
  onClose,
  onSaved,
}: {
  site?: Site;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(site?.name ?? '');
  const [code, setCode] = useState(site?.code ?? '');
  const [address, setAddress] = useState(site?.address ?? '');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setErr(null);
    setSaving(true);
    const body = {
      name: name.trim(),
      code: code.trim() || undefined,
      address: address.trim() || undefined,
    };
    try {
      if (site) await api.patch(`/sites/${site.id}`, body);
      else await api.post('/sites', body);
      onSaved();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Could not save the site');
      setSaving(false);
    }
  }

  return (
    <Modal title={site ? 'Edit site' : 'Add site'} onClose={onClose}>
      <div className="stack">
        <ErrorBanner message={err} />
        <label className="field">
          Site name *
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Northside Panel"
          />
        </label>
        <label className="field">
          Short code
          <input
            className="input"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="e.g. NTH"
            maxLength={12}
          />
        </label>
        <label className="field">
          Address
          <input
            className="input"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="e.g. 12 Sydney Rd, Coburg"
          />
        </label>
        <div className="row">
          <div className="spacer" />
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn primary"
            disabled={saving || !name.trim()}
            onClick={() => void submit()}
          >
            {saving ? 'Saving…' : site ? 'Save' : 'Add site'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
