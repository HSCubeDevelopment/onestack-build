/** Company forms (intake) — web types + helpers. Mirrors the API's intake form/field shapes. */

export type IntakeFieldType = 'text' | 'number' | 'date' | 'select' | 'boolean';

export const INTAKE_FIELD_TYPES: IntakeFieldType[] = [
  'text',
  'number',
  'date',
  'select',
  'boolean',
];

export const FIELD_TYPE_LABEL: Record<IntakeFieldType, string> = {
  text: 'Text',
  number: 'Number',
  date: 'Date',
  select: 'Choice',
  boolean: 'Yes / No',
};

export interface IntakeField {
  key: string;
  label: string;
  type: IntakeFieldType;
  required: boolean;
  options?: string[];
}

export interface IntakeForm {
  id: string;
  name: string;
  fields: IntakeField[];
  createdAt?: string;
}

/** A label → snake_case field key ("Owner's phone" → "owner_s_phone"), always starting with a letter. */
export function toFieldKey(label: string): string {
  const base = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return /^[a-z]/.test(base) ? base : `field_${base || 'x'}`;
}
