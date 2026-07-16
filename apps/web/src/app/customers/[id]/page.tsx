'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { api, Contact, CustomField, Vehicle } from '@/lib/api';
import { EmptyState, ErrorBanner, Loading, Modal, PageHead, useAsync } from '@/components/ui';
import { CustomFieldInputs } from '@/components/CustomFieldInputs';

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [editing, setEditing] = useState(false);
  const [addingVehicle, setAddingVehicle] = useState(false);

  const { data, loading, error, reload } = useAsync(
    () =>
      Promise.all([
        api.get<Contact>(`/contacts/${id}`),
        api.get<Vehicle[]>(`/contacts/${id}/vehicles`),
        api.get<CustomField[]>('/custom-fields?appliesTo=customer'),
        api.get<CustomField[]>('/custom-fields?appliesTo=vehicle'),
      ]),
    [id],
  );

  return (
    <>
      <div style={{ marginBottom: 12 }}>
        <Link href="/customers" className="link-btn">
          ← Back to customers
        </Link>
      </div>
      <ErrorBanner message={error} />
      {loading && <Loading />}
      {data && (
        <CustomerDetail
          contact={data[0]}
          vehicles={data[1]}
          customerFields={data[2].filter((f) => !f.archived)}
          vehicleFields={data[3].filter((f) => !f.archived)}
          editing={editing}
          setEditing={setEditing}
          addingVehicle={addingVehicle}
          setAddingVehicle={setAddingVehicle}
          reload={reload}
        />
      )}
    </>
  );
}

function CustomerDetail({
  contact,
  vehicles,
  customerFields,
  vehicleFields,
  editing,
  setEditing,
  addingVehicle,
  setAddingVehicle,
  reload,
}: {
  contact: Contact;
  vehicles: Vehicle[];
  customerFields: CustomField[];
  vehicleFields: CustomField[];
  editing: boolean;
  setEditing: (v: boolean) => void;
  addingVehicle: boolean;
  setAddingVehicle: (v: boolean) => void;
  reload: () => void;
}) {
  const populatedFields = customerFields.filter(
    (f) => contact.customFields[f.key] !== undefined && contact.customFields[f.key] !== '',
  );

  return (
    <>
      <PageHead
        title={contact.displayName}
        sub={[contact.phone, contact.email].filter(Boolean).join(' · ') || undefined}
      >
        <button className="btn" onClick={() => setEditing(true)}>
          Edit
        </button>
      </PageHead>

      {populatedFields.length > 0 && (
        <div className="card" style={{ marginBottom: 14 }}>
          <h3 style={{ marginBottom: 12 }}>Details</h3>
          <div className="grid cols-2">
            {populatedFields.map((f) => (
              <div key={f.id} className="kpi" style={{ gap: 3 }}>
                <span className="faint" style={{ fontSize: 12 }}>
                  {f.label}
                </span>
                <span>{formatValue(contact.customFields[f.key])}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card pad0">
        <div className="row" style={{ padding: '14px 18px' }}>
          <h2>Vehicles</h2>
          <div className="spacer" />
          <button className="btn sm" onClick={() => setAddingVehicle(true)}>
            + Add vehicle
          </button>
        </div>
        <div className="divider" />
        {vehicles.length === 0 ? (
          <EmptyState>No vehicles yet.</EmptyState>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Rego</th>
                <th>Make</th>
                <th>Model</th>
                <th>Year</th>
                <th>VIN</th>
              </tr>
            </thead>
            <tbody>
              {vehicles.map((v) => (
                <tr key={v.id}>
                  <td>
                    <strong>{fieldStr(v, 'rego') || v.label}</strong>
                  </td>
                  <td>{fieldStr(v, 'make') || <span className="faint">—</span>}</td>
                  <td>{fieldStr(v, 'model') || <span className="faint">—</span>}</td>
                  <td>{fieldStr(v, 'year') || <span className="faint">—</span>}</td>
                  <td className="mono">{fieldStr(v, 'vin') || <span className="faint">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {editing && (
        <EditCustomerModal
          contact={contact}
          fields={customerFields}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            reload();
          }}
        />
      )}

      {addingVehicle && (
        <AddVehicleModal
          contactId={contact.id}
          fields={vehicleFields}
          onClose={() => setAddingVehicle(false)}
          onSaved={() => {
            setAddingVehicle(false);
            reload();
          }}
        />
      )}
    </>
  );
}

function EditCustomerModal({
  contact,
  fields,
  onClose,
  onSaved,
}: {
  contact: Contact;
  fields: CustomField[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [displayName, setDisplayName] = useState(contact.displayName);
  const [phone, setPhone] = useState(contact.phone ?? '');
  const [email, setEmail] = useState(contact.email ?? '');
  const [customFields, setCustomFields] = useState<Record<string, unknown>>({
    ...contact.customFields,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.patch<Contact>(`/contacts/${contact.id}`, {
        displayName: displayName.trim(),
        phone: phone.trim(),
        email: email.trim() || null,
        customFields,
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSaving(false);
    }
  };

  return (
    <Modal title="Edit customer" onClose={onClose}>
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
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function AddVehicleModal({
  contactId,
  fields,
  onClose,
  onSaved,
}: {
  contactId: string;
  fields: CustomField[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [rego, setRego] = useState('');
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [year, setYear] = useState('');
  const [vin, setVin] = useState('');
  const [customFields, setCustomFields] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.post<Vehicle>(`/contacts/${contactId}/vehicles`, {
        rego: rego.trim(),
        make: make.trim(),
        model: model.trim(),
        year: Number(year),
        vin: vin.trim() || undefined,
        customFields,
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSaving(false);
    }
  };

  return (
    <Modal title="Add vehicle" onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <ErrorBanner message={error} />
        <div className="grid cols-2">
          <label className="field">
            Rego *
            <input
              className="input"
              required
              value={rego}
              onChange={(e) => setRego(e.target.value)}
            />
          </label>
          <label className="field">
            Year *
            <input
              className="input"
              required
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
              required
              value={make}
              onChange={(e) => setMake(e.target.value)}
            />
          </label>
          <label className="field">
            Model *
            <input
              className="input"
              required
              value={model}
              onChange={(e) => setModel(e.target.value)}
            />
          </label>
        </div>
        <label className="field">
          VIN
          <input className="input" value={vin} onChange={(e) => setVin(e.target.value)} />
        </label>
        <CustomFieldInputs fields={fields} values={customFields} onChange={setCustomFields} />
        <div className="row">
          <div className="spacer" />
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={saving}>
            {saving ? 'Saving…' : 'Add vehicle'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function fieldStr(v: Vehicle, key: string): string {
  const raw = v.fields[key];
  return raw === undefined || raw === null ? '' : String(raw);
}

function formatValue(v: unknown): string {
  if (v === true) return 'Yes';
  if (v === false) return 'No';
  return String(v);
}
