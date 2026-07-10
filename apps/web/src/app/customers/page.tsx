'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, Contact, CustomField } from '@/lib/api';
import { EmptyState, ErrorBanner, Loading, Modal, PageHead, useAsync } from '@/components/ui';
import { CustomFieldInputs } from '@/components/CustomFieldInputs';

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

      <div className="card pad0">
        <form className="row" style={{ padding: '14px 18px' }} onSubmit={onSearchSubmit}>
          <input
            className="input"
            placeholder="Search by name, phone or email…"
            value={q}
            onChange={(e) => onSearchChange(e.target.value)}
            style={{ maxWidth: 360 }}
          />
        </form>
        <div className="divider" />
        {loading ? (
          <Loading />
        ) : contacts.length === 0 ? (
          <EmptyState>{q.trim() ? 'No customers match.' : 'No customers yet.'}</EmptyState>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Phone</th>
                <th>Email</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {contacts.map((c) => (
                <tr
                  key={c.id}
                  className="clickable"
                  onClick={() => router.push(`/customers/${c.id}`)}
                >
                  <td>
                    <strong>{c.displayName}</strong>
                  </td>
                  <td>{c.phone ?? <span className="faint">—</span>}</td>
                  <td>{c.email ?? <span className="faint">—</span>}</td>
                  <td className="muted">
                    {new Date(c.createdAt).toLocaleDateString('en-AU', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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

