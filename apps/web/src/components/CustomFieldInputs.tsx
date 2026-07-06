'use client';
import { CustomField } from '@/lib/api';

/** Renders a dynamic input per active custom field, writing into a customFields bag keyed by field.key. */
export function CustomFieldInputs({
  fields,
  values,
  onChange,
}: {
  fields: CustomField[];
  values: Record<string, unknown>;
  onChange: (v: Record<string, unknown>) => void;
}) {
  if (fields.length === 0) return null;
  const set = (key: string, value: unknown) => onChange({ ...values, [key]: value });

  return (
    <>
      {fields.map((f) => {
        const val = values[f.key];
        if (f.type === 'boolean') {
          return (
            <label
              key={f.id}
              className="field"
              style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
            >
              <input
                type="checkbox"
                checked={val === true}
                onChange={(e) => set(f.key, e.target.checked)}
              />
              {f.label}
              {f.required && ' *'}
            </label>
          );
        }
        return (
          <label key={f.id} className="field">
            {f.label}
            {f.required && ' *'}
            {f.type === 'select' ? (
              <select
                className="select"
                required={f.required}
                value={val === undefined || val === null ? '' : String(val)}
                onChange={(e) => set(f.key, e.target.value || undefined)}
              >
                <option value="">Select…</option>
                {f.options.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            ) : (
              <input
                className="input"
                required={f.required}
                type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'}
                value={val === undefined || val === null ? '' : String(val)}
                onChange={(e) => {
                  const raw = e.target.value;
                  if (raw === '') set(f.key, undefined);
                  else set(f.key, f.type === 'number' ? Number(raw) : raw);
                }}
              />
            )}
          </label>
        );
      })}
    </>
  );
}
