// Unit tests for the pure intake-form logic (Phase 3 — digital intake & forms). No DB.
import { describe, expect, it } from 'vitest';
import { IntakeField, validateAnswers, validateFields } from './intake';

const fail = (m: string) => new Error(m);

describe('validateFields', () => {
  it('accepts a valid set of fields', () => {
    const out = validateFields(
      [
        { key: 'symptom', label: 'Symptom', type: 'text', required: true },
        {
          key: 'urgency',
          label: 'Urgency',
          type: 'select',
          required: false,
          options: ['Low', 'High'],
        },
      ],
      fail,
    );
    expect(out).toHaveLength(2);
    expect(out[1]?.options).toEqual(['Low', 'High']);
  });

  it('rejects empty, bad keys, dup keys, and a select without options', () => {
    expect(() => validateFields([], fail)).toThrow(/at least one field/i);
    expect(() => validateFields([{ key: 'Bad Key', label: 'x', type: 'text' }], fail)).toThrow(
      /snake_case/i,
    );
    expect(() =>
      validateFields(
        [
          { key: 'a', label: 'A', type: 'text' },
          { key: 'a', label: 'A2', type: 'text' },
        ],
        fail,
      ),
    ).toThrow(/duplicate/i);
    expect(() => validateFields([{ key: 'c', label: 'C', type: 'select' }], fail)).toThrow(
      /option/i,
    );
  });
});

describe('validateAnswers', () => {
  const fields: IntakeField[] = [
    { key: 'symptom', label: 'Symptom', type: 'text', required: true },
    { key: 'mileage', label: 'Mileage', type: 'number', required: false },
    { key: 'urgency', label: 'Urgency', type: 'select', required: false, options: ['Low', 'High'] },
    { key: 'loaner', label: 'Loaner?', type: 'boolean', required: false },
  ];

  it('accepts + coerces valid answers, skipping blanks', () => {
    expect(
      validateAnswers(fields, { symptom: 'Noise', mileage: 42000, loaner: true }, fail),
    ).toEqual({
      symptom: 'Noise',
      mileage: 42000,
      loaner: true,
    });
  });

  it('rejects a missing required answer, an unknown key, and a bad type/option', () => {
    expect(() => validateAnswers(fields, {}, fail)).toThrow(/Symptom.*required/i);
    expect(() => validateAnswers(fields, { symptom: 'x', nope: 1 }, fail)).toThrow(
      /unknown field/i,
    );
    expect(() => validateAnswers(fields, { symptom: 'x', mileage: 'lots' }, fail)).toThrow(
      /number/i,
    );
    expect(() => validateAnswers(fields, { symptom: 'x', urgency: 'Medium' }, fail)).toThrow(
      /one of/i,
    );
  });
});
