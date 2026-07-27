'use client';
import { useState } from 'react';
import { api } from '@/lib/api';
import { EmptyState, ErrorBanner, Loading, Modal, PageHead, useAsync } from '@/components/ui';
import {
  FIELD_TYPE_LABEL,
  IntakeField,
  IntakeFieldType,
  IntakeForm,
  INTAKE_FIELD_TYPES,
  toFieldKey,
} from '@/lib/forms';

/**
 * Company forms — build and manage the forms the shop uses (intake checklists, questionnaires, etc.).
 * Backed by the existing intake form-builder API. Owner surface: create a form, define its fields, edit
 * it later. (Employee fill/submit is customer-scoped and comes next.)
 */
export default function FormsPage() {
  const { data, loading, error, reload } = useAsync<IntakeForm[]>(
    () => api.get<IntakeForm[]>('/intake-forms'),
    [],
  );
  const [editing, setEditing] = useState<IntakeForm | 'new' | null>(null);

  return (
    <>
      <PageHead title="Forms" sub="Build and manage the forms your team uses">
        <button className="btn primary" onClick={() => setEditing('new')}>
          + New form
        </button>
      </PageHead>

      <ErrorBanner message={error} />
      {loading ? (
        <Loading />
      ) : (data ?? []).length === 0 ? (
        <div className="card">
          <EmptyState>No forms yet. Create your first form.</EmptyState>
        </div>
      ) : (
        <div className="stack">
          {data!.map((f) => (
            <div
              key={f.id}
              className="card"
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
            >
              <div>
                <b>{f.name}</b>
                <div className="faint" style={{ fontSize: 12 }}>
                  {f.fields.length} field{f.fields.length === 1 ? '' : 's'}
                </div>
              </div>
              <button className="btn sm" onClick={() => setEditing(f)}>
                Edit
              </button>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <FormEditor
          form={editing === 'new' ? null : editing}
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

type DraftField = IntakeField & { options?: string[] };

function FormEditor({
  form,
  onClose,
  onSaved,
}: {
  form: IntakeForm | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(form?.name ?? '');
  const [fields, setFields] = useState<DraftField[]>(form?.fields ?? []);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const setField = (i: number, patch: Partial<DraftField>) =>
    setFields((fs) => fs.map((f, j) => (j === i ? { ...f, ...patch } : f)));
  const addField = () =>
    setFields((fs) => [...fs, { key: '', label: '', type: 'text', required: false }]);
  const removeField = (i: number) => setFields((fs) => fs.filter((_, j) => j !== i));

  async function save() {
    setErr(null);
    if (!name.trim()) return setErr('Give the form a name.');
    const named = fields.filter((f) => f.label.trim());
    if (named.length === 0) return setErr('Add at least one field.');

    // Unique snake_case keys (preserve existing keys; generate from the label for new fields).
    const seen = new Set<string>();
    const built = named.map((f) => {
      let key = f.key || toFieldKey(f.label);
      let n = 2;
      const base = key;
      while (seen.has(key)) key = `${base}_${n++}`;
      seen.add(key);
      return {
        key,
        label: f.label.trim(),
        type: f.type,
        required: f.required,
        ...(f.type === 'select' ? { options: (f.options ?? []).filter((o) => o.trim()) } : {}),
      };
    });
    const badSelect = built.find(
      (f) => f.type === 'select' && (!f.options || f.options.length === 0),
    );
    if (badSelect)
      return setErr(`"${badSelect.label}" is a Choice field — add at least one choice.`);

    setSaving(true);
    try {
      if (form) await api.patch(`/intake-forms/${form.id}`, { name: name.trim(), fields: built });
      else await api.post('/intake-forms', { name: name.trim(), fields: built });
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not save the form.');
      setSaving(false);
    }
  }

  return (
    <Modal title={form ? 'Edit form' : 'New form'} onClose={onClose}>
      <div className="stack">
        <ErrorBanner message={err} />
        <label className="field">
          Form name
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Vehicle intake checklist"
          />
        </label>

        <div className="lbl2">FIELDS</div>
        {fields.length === 0 && (
          <div className="hintnote" style={{ margin: 0 }}>
            Add the questions this form should capture.
          </div>
        )}
        {fields.map((f, i) => (
          <div key={i} className="card" style={{ padding: 10 }}>
            <div className="grid cols-2" style={{ gap: 8 }}>
              <label className="field">
                Label
                <input
                  className="input"
                  value={f.label}
                  onChange={(e) => setField(i, { label: e.target.value })}
                />
              </label>
              <label className="field">
                Type
                <select
                  className="select"
                  value={f.type}
                  onChange={(e) => setField(i, { type: e.target.value as IntakeFieldType })}
                >
                  {INTAKE_FIELD_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {FIELD_TYPE_LABEL[t]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {f.type === 'select' && (
              <label className="field">
                Choices (comma-separated)
                <input
                  className="input"
                  value={(f.options ?? []).join(', ')}
                  onChange={(e) =>
                    setField(i, { options: e.target.value.split(',').map((s) => s.trim()) })
                  }
                  placeholder="e.g. Yes, No, Unsure"
                />
              </label>
            )}
            <div className="row" style={{ justifyContent: 'space-between', marginTop: 6 }}>
              <label className="row" style={{ gap: 6, fontSize: 13 }}>
                <input
                  type="checkbox"
                  checked={f.required}
                  onChange={(e) => setField(i, { required: e.target.checked })}
                />
                Required
              </label>
              <button className="btn danger sm" onClick={() => removeField(i)}>
                Remove
              </button>
            </div>
          </div>
        ))}
        <button className="btn" onClick={addField}>
          + Add field
        </button>

        <div className="row">
          <div className="spacer" />
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={saving} onClick={() => void save()}>
            {saving ? 'Saving…' : 'Save form'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
