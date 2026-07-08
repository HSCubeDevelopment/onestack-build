/**
 * Pure intake-form logic (Phase 3 — digital intake & forms). No DB — cheap to unit test. Validates a
 * form's field definitions and a submission's answers against them. Field types mirror the custom-field
 * system but the intake form owns its own defs, so a form can collect any subset of questions.
 */

export type IntakeFieldType = 'text' | 'number' | 'date' | 'select' | 'boolean';
export const INTAKE_FIELD_TYPES: readonly IntakeFieldType[] = [
  'text',
  'number',
  'date',
  'select',
  'boolean',
] as const;

export interface IntakeField {
  key: string;
  label: string;
  type: IntakeFieldType;
  required: boolean;
  options?: string[];
}

const KEY_RE = /^[a-z][a-z0-9_]{0,49}$/;

/** Validate + normalise a form's field definitions. Throws (via the factory) on bad input. */
export function validateFields(raw: unknown, fail: (msg: string) => Error): IntakeField[] {
  if (!Array.isArray(raw) || raw.length === 0) throw fail('A form needs at least one field');
  const seen = new Set<string>();
  return raw.map((f, idx) => {
    if (!f || typeof f !== 'object') throw fail(`fields[${idx}] is invalid`);
    const e = f as Record<string, unknown>;
    const key = typeof e.key === 'string' ? e.key.trim() : '';
    if (!KEY_RE.test(key))
      throw fail(`fields[${idx}].key must be snake_case starting with a letter`);
    if (seen.has(key)) throw fail(`Duplicate field key "${key}"`);
    seen.add(key);
    const label = typeof e.label === 'string' ? e.label.trim() : '';
    if (!label) throw fail(`fields[${idx}].label is required`);
    const type = e.type as IntakeFieldType;
    if (!INTAKE_FIELD_TYPES.includes(type)) throw fail(`fields[${idx}].type is invalid`);
    const options =
      type === 'select'
        ? (Array.isArray(e.options) ? e.options : []).map(String).filter((s) => s.trim())
        : undefined;
    if (type === 'select' && (!options || options.length === 0))
      throw fail(`fields[${idx}] is a select and needs at least one option`);
    return { key, label, type, required: e.required === true, ...(options ? { options } : {}) };
  });
}

/** Validate a submission's answers against the form's fields; returns the clean answer bag. */
export function validateAnswers(
  fields: IntakeField[],
  answers: Record<string, unknown>,
  fail: (msg: string) => Error,
): Record<string, unknown> {
  const byKey = new Map(fields.map((f) => [f.key, f]));
  for (const key of Object.keys(answers)) {
    if (!byKey.has(key)) throw fail(`Unknown field "${key}"`);
  }
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    const v = answers[f.key];
    if (v === undefined || v === null || v === '') {
      if (f.required) throw fail(`"${f.label}" is required`);
      continue;
    }
    out[f.key] = coerce(f, v, fail);
  }
  return out;
}

function coerce(f: IntakeField, raw: unknown, fail: (msg: string) => Error): unknown {
  switch (f.type) {
    case 'text':
    case 'date':
      if (typeof raw !== 'string') throw fail(`"${f.label}" must be text`);
      return raw;
    case 'number':
      if (typeof raw !== 'number' || Number.isNaN(raw)) throw fail(`"${f.label}" must be a number`);
      return raw;
    case 'boolean':
      if (typeof raw !== 'boolean') throw fail(`"${f.label}" must be true/false`);
      return raw;
    case 'select':
      if (typeof raw !== 'string' || !(f.options ?? []).includes(raw))
        throw fail(`"${f.label}" must be one of: ${(f.options ?? []).join(', ')}`);
      return raw;
    default:
      throw fail(`"${f.label}" has an unsupported type`);
  }
}
