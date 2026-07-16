import { describe, expect, it } from 'vitest';
import { draftReengagementMessage, medianGapDays, scoreChurn, scoreNoShow } from './insights';

describe('scoreNoShow', () => {
  it('is low for an established, reachable customer at normal notice', () => {
    const r = scoreNoShow({ daysUntil: 5, isNewCustomer: false, hasReminderContact: true });
    expect(r.level).toBe('low');
    expect(r.reasons).toHaveLength(0);
  });

  it('is high when unreachable and a new customer', () => {
    const r = scoreNoShow({ daysUntil: 5, isNewCustomer: true, hasReminderContact: false });
    expect(r.level).toBe('high');
    expect(r.reasons.join(' ')).toMatch(/reminder cannot be sent/i);
    expect(r.reasons.join(' ')).toMatch(/first-time/i);
  });

  it('flags very short notice and long-lead bookings', () => {
    expect(
      scoreNoShow({ daysUntil: 0.5, isNewCustomer: false, hasReminderContact: true }).reasons.join(
        ' ',
      ),
    ).toMatch(/short notice/i);
    expect(
      scoreNoShow({ daysUntil: 30, isNewCustomer: false, hasReminderContact: true }).reasons.join(
        ' ',
      ),
    ).toMatch(/well in advance/i);
  });

  it('never exceeds 100', () => {
    const r = scoreNoShow({ daysUntil: 0.1, isNewCustomer: true, hasReminderContact: false });
    expect(r.score).toBeLessThanOrEqual(100);
  });
});

describe('scoreChurn', () => {
  it('is low for a customer within their usual cadence', () => {
    const r = scoreChurn({ daysSinceLastJob: 80, jobCount: 4, medianGapDays: 90 });
    expect(r.level).toBe('low');
  });

  it('is high for a regular who is well overdue', () => {
    const r = scoreChurn({ daysSinceLastJob: 300, jobCount: 4, medianGapDays: 90 });
    expect(r.level).toBe('high');
    expect(r.reasons.join(' ')).toMatch(/overdue/i);
    expect(r.reasons.join(' ')).toMatch(/repeat customer/i);
  });

  it('uses the fixed gone-quiet threshold when cadence is unknown', () => {
    expect(
      scoreChurn({ daysSinceLastJob: 400, jobCount: 1, medianGapDays: 0 }).reasons.join(' '),
    ).toMatch(/gone quiet/i);
    expect(scoreChurn({ daysSinceLastJob: 200, jobCount: 1, medianGapDays: 0 }).level).not.toBe(
      'low',
    );
    expect(scoreChurn({ daysSinceLastJob: 30, jobCount: 1, medianGapDays: 0 }).level).toBe('low');
  });
});

describe('medianGapDays', () => {
  it('returns 0 for fewer than two visits', () => {
    expect(medianGapDays([])).toBe(0);
    expect(medianGapDays([1000])).toBe(0);
  });

  it('computes the median gap in days', () => {
    const day = 1000 * 60 * 60 * 24;
    // gaps: 10 days, 20 days → median 15
    expect(medianGapDays([0, 10 * day, 30 * day])).toBe(15);
  });
});

describe('draftReengagementMessage', () => {
  it('addresses the customer and is a non-committal draft', () => {
    const m = draftReengagementMessage('Sam');
    expect(m).toContain('Sam');
    expect(m.toLowerCase()).toContain('been a while');
  });

  it('falls back to a friendly default for a blank name', () => {
    expect(draftReengagementMessage('   ')).toContain('there');
  });
});
