'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronRight, Search } from 'lucide-react';
import { api, Contact, CustomField } from '@/lib/api';
import { EmptyState, ErrorBanner, Loading, Modal, PageHead, useAsync } from '@/components/ui';
import { CustomFieldInputs } from '@/components/CustomFieldInputs';

/** Two-letter initials for the avatar, from a display name. */
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '#';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function CustomersPage() {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  // Active custom fields for the create form.
  const { data: fields } = useAsync(
    () => api.get<CustomField[]>('/custom-fields?appliesTo=customer'),
    [],
  );
  const activeFields = (fields ?? []).filter((f) => !f.archived);

  const load = async (term: string) => {
    setLoading(true);
    setError(null);
    try {
      const path = term.trim() ? `/contacts?q=${encodeURIComponent(term.trim())}` : '/contacts';
      setContacts(await api.get<Contact[]>(path));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  // Initial load.
  useEffect(() => {
    void load('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounced search on query change.
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onSearchChange = (value: string) => {
    setQ(value);
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => void load(value), 250);
  };
  const onSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (debounce.current) clearTimeout(debounce.current);
    void load(q);
  };

  return (
    <>
      <PageHead title="Customers" sub="People and businesses you work with">
        <button className="btn" onClick={() => router.push('/customers/duplicates')}>
          Find duplicates
        </button>
        <button className="btn primary" onClick={() => setCreating(true)}>
          + New customer
        </button>
      </PageHead>

      <ErrorBanner message={error} />

      <form onSubmit={onSearchSubmit}>
        <label className="search-field">
          <Search size={16} aria-hidden />
          <input
            placeholder="Search by name, phone or email…"
            value={q}
            onChange={(e) => onSearchChange(e.target.value)}
            aria-label="Search customers"
          />
        </label>
      </form>

      <div className="card">
        {loading ? (
          <Loading />
        ) : contacts.length === 0 ? (
          <EmptyState>{q.trim() ? 'No customers match.' : 'No customers yet.'}</EmptyState>
        ) : (
          contacts.map((c) => (
            <Link key={c.id} href={`/customers/${c.id}`} className="job-row">
              <div className="job-row-main">
                <span className="avatar" aria-hidden>
                  {initialsOf(c.displayName)}
                </span>
                <div style={{ minWidth: 0 }}>
                  <b style={{ fontSize: 14 }}>{c.displayName}</b>
                  <div className="job-cust">
                    {c.phone ?? c.email ?? <span className="faint">No contact details</span>}
                  </div>
                </div>
              </div>
              <ChevronRight size={16} className="more-chev" aria-hidden />
            </Link>
          ))
        )}
      </div>

      {creating && (
        <NewCustomerModal
          fields={activeFields}
          onClose={() => setCreating(false)}
          onCreated={(c) => {
            setCreating(false);
            router.push(`/customers/${c.id}`);
          }}
        />
      )}
    </>
  );
}

function NewCustomerModal({
  fields,
  onClose,
  onCreated,
}: {
  fields: CustomField[];
  onClose: () => void;
  onCreated: (c: Contact) => void;
}) {
  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [customFields, setCustomFields] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const c = await api.post<Contact>('/contacts', {
        displayName: displayName.trim(),
        phone: phone.trim(),
        email: email.trim() || undefined,
        customFields,
      });
      onCreated(c);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSaving(false);
    }
  };

  return (
    <Modal title="New customer" onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <ErrorBanner message={error} />
        <label className="field">
          Name *
          <input
            className="input"
            required
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
        </label>
        <div className="grid cols-2">
          <label className="field">
            Phone *
            <input
              className="input"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </label>
          <label className="field">
            Email
            <input
              className="input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
        </div>
        <CustomFieldInputs fields={fields} values={customFields} onChange={setCustomFields} />
        <div className="row">
          <div className="spacer" />
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={saving}>
            {saving ? 'Saving…' : 'Create customer'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
