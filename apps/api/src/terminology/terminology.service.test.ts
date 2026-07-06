import { describe, expect, it } from 'vitest';
import { Pack } from '../core/pack-contract';
import { PackRegistry } from '../core/pack-registry';
import { TerminologyService } from './terminology.service';

const automotive: Pack = {
  id: 'automotive',
  label: 'Automotive',
  terminology: {
    work_item: { label: 'Job', plural: 'Jobs' },
    subject: { label: 'Vehicle', plural: 'Vehicles' },
    contact: { label: 'Customer', plural: 'Customers' },
  },
};

const physio: Pack = {
  id: 'physio',
  label: 'Physio',
  terminology: {
    work_item: { label: 'Appointment', plural: 'Appointments' },
    contact: { label: 'Patient', plural: 'Patients' },
  },
};

function service(...packs: Pack[]): TerminologyService {
  const registry = new PackRegistry();
  for (const p of packs) registry.register(p);
  return new TerminologyService(registry);
}

describe('TerminologyService', () => {
  it('falls back to the generic label when no pack overrides a term', () => {
    expect(service().label('work_item')).toBe('Work Item');
    expect(service().plural('contact')).toBe('Contacts');
  });

  it('a pack relabels core concepts', () => {
    const t = service(automotive);
    expect(t.label('work_item')).toBe('Job');
    expect(t.plural('subject')).toBe('Vehicles');
    expect(t.label('contact')).toBe('Customer');
  });

  it('switching the active pack changes the labels (no code change)', () => {
    // Both packs installed; scope resolution to the tenant's active pack.
    const t = service(automotive, physio);
    expect(t.label('work_item', { packIds: ['automotive'] })).toBe('Job');
    expect(t.label('work_item', { packIds: ['physio'] })).toBe('Appointment');
    // physio doesn't override "subject" → generic fallback.
    expect(t.label('subject', { packIds: ['physio'] })).toBe('Subject');
  });

  it('humanizes an unknown concept as a last resort', () => {
    expect(service().label('purchase_order')).toBe('Purchase Order');
  });

  it('all() returns the merged map for embedding in API responses', () => {
    const t = service(automotive);
    expect(t.all().work_item?.label).toBe('Job');
    expect(t.all().contact?.label).toBe('Customer');
  });
});
