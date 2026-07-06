import { describe, expect, it } from 'vitest';
import {
  renderDocument,
  renderTemplate,
  templateVersion,
  TemplateError,
} from './template-renderer';

describe('template renderer', () => {
  it('interpolates dotted paths', () => {
    expect(
      renderTemplate('Quote {{ reference }} for {{ customer.name }}', {
        reference: 'WI-000001',
        customer: { name: 'Casey' },
      }),
    ).toBe('Quote WI-000001 for Casey');
  });

  it('throws on a missing or non-scalar variable (template/data mismatch)', () => {
    expect(() => renderTemplate('Hi {{ name }}', {})).toThrow(TemplateError);
    expect(() => renderTemplate('X {{ obj }}', { obj: { a: 1 } })).toThrow(TemplateError);
  });

  it('is deterministic: same template + data → same output and version', () => {
    const body = 'Total: {{ total }}';
    const a = renderDocument('quote', body, { total: '1100' });
    const b = renderDocument('quote', body, { total: '1100' });
    expect(a).toEqual(b);
    expect(a.templateVersion).toBe(templateVersion(body));
  });

  it('version changes when the template body changes, and is stable otherwise', () => {
    expect(templateVersion('A')).toBe(templateVersion('A'));
    expect(templateVersion('A')).not.toBe(templateVersion('B'));
  });
});
