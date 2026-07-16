'use client';
import { useState } from 'react';
import { api, CustomField } from '@/lib/api';
import { EmptyState, ErrorBanner, Loading, Modal, PageHead, useAsync } from '@/components/ui';

type AppliesTo = 'customer' | 'vehicle';
type FieldType = 'text' | 'number' | 'date' | 'select' | 'boolean';

const KEY_RE = /^[a-z][a-z0-9_]{0,49}$/;
const TYPE_COLORS: Record<string, string> = {
  text: '',
  number: 'blue',
  date: 'purple',
  select: 'amber',
  boolean: 'green',
};

function suggestKey(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 50);
}

export default function CustomFieldsPage() {
  const [tab, setTab] = useState<AppliesTo>('customer');

  return (
    <>
      <PageHead title="Custom fields" sub="Add your own fields to customers & vehicles" />
      <div className="tabs">
        <div
          className={`tab ${tab === 'customer' ? 'active' : ''}`}
          onClick={() => setTab('customer')}
        >
          Customer fields
        </div>
        <div
          className={`tab ${tab === 'vehicle' ? 'active' : ''}`}
          onClick={() => setTab('vehicle')}
        >
          Vehicle fields
        </div>
      </div>
      {/* Key remounts per tab so its own load runs */}
      <FieldsTab key={tab} appliesTo={tab} />
    </>
  );
}

function FieldsTab({ appliesTo }: { appliesTo: AppliesTo }) {
  const { data, loading, error, reload } = useAsync(
    () => api.get<CustomField[]>(`/custom-fields?appliesTo=${appliesTo}`),
    [appliesTo],
  );
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<CustomField | null>(null);
  const [banner, setBanner] = useState<string | null>(null);

  const fields = data ?? [];

  async function archive(f: CustomField) {
    if (!confirm(`Archive "${f.label}"? Existing values are kept but the field is hidden.`)) return;
    setBanner(null);
    try {
      await api.del(`/custom-fields/${f.id}`);
      await reload();
    } catch (e) {
      setBanner(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <>
      <div className="row" style={{ marginBottom: 14 }}>
        <div className="spacer" />
        <button className="btn primary" onClick={() => setCreating(true)}>
          + New field
        </button>
      </div>

      <ErrorBanner message={error ?? banner} />

      {loading ? (
        <Loading />
      ) : fields.length === 0 ? (
        <div className="card">
          <EmptyState>No {appliesTo} fields yet. Add one with “+ New field”.</EmptyState>
        </div>
      ) : (
        <div className="card pad0">
          <table className="table">
            <thead>
              <tr>
                <th>Label</th>
                <th>Key</th>
                <th>Type</th>
                <th>Required</th>
                <th>Options</th>
                <th></th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {fields.map((f) => (
                <tr key={f.id} style={f.archived ? { opacity: 0.5 } : undefined}>
                  <td>{f.label}</td>
                  <td className="mono">{f.key}</td>
                  <td>
                    <span className={`badge ${TYPE_COLORS[f.type] ?? ''}`}>{f.type}</span>
                  </td>
                  <td>
                    {f.required ? (
                      <span className="badge amber">Required</span>
                    ) : (
                      <span className="faint">—</span>
                    )}
                  </td>
                  <td>
                    {f.type === 'select' && f.options.length ? (
                      <span className="faint">{f.options.join(', ')}</span>
                    ) : (
                      <span className="faint">—</span>
                    )}
                  </td>
                  <td>{f.archived && <span className="badge">Archived</span>}</td>
                  <td className="right nowrap">
                    {!f.archived && (
                      <>
                        <button className="btn ghost sm" onClick={() => setEditing(f)}>
                          Edit
                        </button>
                        <button className="btn danger sm" onClick={() => archive(f)}>
                          Archive
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {creating && (
        <NewFieldModal
          appliesTo={appliesTo}
          onClose={() => setCreating(false)}
          onSaved={async () => {
            setCreating(false);
            await reload();
          }}
        />
      )}

      {editing && (
        <EditFieldModal
          field={editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await reload();
          }}
        />
      )}
    </>
  );
}

function NewFieldModal({
  appliesTo,
  onClose,
  onSaved,
}: {
  appliesTo: AppliesTo;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [label, setLabel] = useState('');
  const [key, setKey] = useState('');
  const [keyTouched, setKeyTouched] = useState(false);
  const [type, setType] = useState<FieldType>('text');
  const [required, setRequired] = useState(false);
  const [optionsRaw, setOptionsRaw] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const effectiveKey = keyTouched ? key : suggestKey(label);
  const keyValid = KEY_RE.test(effectiveKey);

  async function save() {
    setErr(null);
    if (!keyValid) {
      setErr('Key must be snake_case, start with a letter (a–z, 0–9, _).');
      return;
    }
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        appliesTo,
        key: effectiveKey,
        label: label.trim(),
        type,
        required,
      };
      if (type === 'select') {
        body.options = optionsRaw
          .split(',')
          .map((o) => o.trim())
          .filter(Boolean);
      }
      await api.post<CustomField>('/custom-fields', body);
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={`New ${appliesTo} field`} onClose={onClose}>
      <div className="stack">
        <ErrorBanner message={err} />
        <label className="field">
          Label
          <input
            className="input"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Insurance company"
          />
        </label>
        <label className="field">
          Key
          <input
            className="input mono"
            value={effectiveKey}
            onChange={(e) => {
              setKeyTouched(true);
              setKey(e.target.value);
            }}
            placeholder="insurance_company"
          />
          {!keyValid && effectiveKey.length > 0 && (
            <span className="faint">
              Must start with a letter; lowercase letters, numbers, underscores only.
            </span>
          )}
        </label>
        <label className="field">
          Type
          <select
            className="select"
            value={type}
            onChange={(e) => setType(e.target.value as FieldType)}
          >
            <option value="text">Text</option>
            <option value="number">Number</option>
            <option value="date">Date</option>
            <option value="select">Select</option>
            <option value="boolean">Boolean</option>
          </select>
        </label>
        {type === 'select' && (
          <label className="field">
            Options (comma-separated)
            <input
              className="input"
              value={optionsRaw}
              onChange={(e) => setOptionsRaw(e.target.value)}
              placeholder="Gold, Silver, Bronze"
            />
          </label>
        )}
        <label className="row" style={{ gap: 8, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={required}
            onChange={(e) => setRequired(e.target.checked)}
          />
          <span>Required</span>
        </label>
        <div className="row">
          <div className="spacer" />
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn primary"
            disabled={saving || !label.trim() || !keyValid}
            onClick={save}
          >
            Create
          </button>
        </div>
      </div>
    </Modal>
  );
}

function EditFieldModal({
  field,
  onClose,
  onSaved,
}: {
  field: CustomField;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [label, setLabel] = useState(field.label);
  const [required, setRequired] = useState(field.required);
  const [optionsRaw, setOptionsRaw] = useState(field.options.join(', '));
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    setErr(null);
    setSaving(true);
    try {
      const body: Record<string, unknown> = { label: label.trim(), required };
      if (field.type === 'select') {
        body.options = optionsRaw
          .split(',')
          .map((o) => o.trim())
          .filter(Boolean);
      }
      await api.patch<CustomField>(`/custom-fields/${field.id}`, body);
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={`Edit “${field.label}”`} onClose={onClose}>
      <div className="stack">
        <ErrorBanner message={err} />
        <label className="field">
          Key
          <input className="input mono" value={field.key} disabled />
        </label>
        <label className="field">
          Label
          <input className="input" value={label} onChange={(e) => setLabel(e.target.value)} />
        </label>
        {field.type === 'select' && (
          <label className="field">
            Options (comma-separated)
            <input
              className="input"
              value={optionsRaw}
              onChange={(e) => setOptionsRaw(e.target.value)}
            />
          </label>
        )}
        <label className="row" style={{ gap: 8, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={required}
            onChange={(e) => setRequired(e.target.checked)}
          />
          <span>Required</span>
        </label>
        <div className="row">
          <div className="spacer" />
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={saving || !label.trim()} onClick={save}>
            Save
          </button>
        </div>
      </div>
    </Modal>
  );
}
