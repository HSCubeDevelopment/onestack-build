/**
 * AI insights & prediction — pure logic (Phase 3, card #142). GENERIC core (Workflow & AI): no vertical
 * nouns. Deterministic, EXPLAINABLE heuristics — every prediction ships with the reasons behind it, and
 * every output is a signal or DRAFT a human reviews, never an automatic action. A real ML/LLM model is a
 * later enhancement behind the same shapes; this MVP is transparent and needs no external vendor. No I/O
 * here — the service assembles the signals from existing services and calls these functions.
 */

export type RiskLevel = 'low' | 'medium' | 'high';

export interface RiskScore {
  /** 0–100; higher = more likely to no-show / churn. */
  score: number;
  level: RiskLevel;
  /** Plain-English drivers, so staff can see WHY (and disagree). */
  reasons: string[];
}

function level(score: number): RiskLevel {
  if (score >= 60) return 'high';
  if (score >= 30) return 'medium';
  return 'low';
}

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

/** Inputs for scoring one upcoming appointment's no-show risk. */
export interface NoShowSignals {
  /** Days from now until the appointment (may be fractional). */
  daysUntil: number;
  /** No prior completed jobs for this customer → less established relationship. */
  isNewCustomer: boolean;
  /** We hold a phone or email, so a reminder can be sent. */
  hasReminderContact: boolean;
}

/**
 * No-show risk for an upcoming appointment. Drivers: no way to remind (no contact), a brand-new customer,
 * very short notice (little time to plan) OR booked a long way out (easy to forget). Explainable, not ML.
 */
export function scoreNoShow(s: NoShowSignals): RiskScore {
  const reasons: string[] = [];
  let score = 10; // baseline

  if (!s.hasReminderContact) {
    score += 35;
    reasons.push('No phone or email on file — a reminder cannot be sent.');
  }
  if (s.isNewCustomer) {
    score += 25;
    reasons.push('First-time customer — no history of showing up.');
  }
  if (s.daysUntil <= 1) {
    score += 20;
    reasons.push('Very short notice — little time to confirm.');
  } else if (s.daysUntil >= 14) {
    score += 20;
    reasons.push('Booked well in advance — easy to forget without a reminder.');
  }

  const finalScore = clamp(score);
  return { score: finalScore, level: level(finalScore), reasons };
}

/** Inputs for scoring one customer's churn risk. */
export interface ChurnSignals {
  /** Days since the customer's most recent job. */
  daysSinceLastJob: number;
  /** How many jobs they've had (a one-off is weaker signal than a regular). */
  jobCount: number;
  /** Their typical gap between jobs, in days (0 if unknown / single job). */
  medianGapDays: number;
}

/**
 * Churn risk for a customer with history. Driver: they're overdue relative to their OWN cadence — if a
 * regular who normally returns every ~90 days hasn't been seen in 300, that's a strong signal. Falls back
 * to a fixed "gone quiet" threshold when we don't yet know their cadence. Explainable, not ML.
 */
export function scoreChurn(s: ChurnSignals): RiskScore {
  const reasons: string[] = [];
  let score = 0;

  if (s.medianGapDays > 0) {
    const ratio = s.daysSinceLastJob / s.medianGapDays;
    if (ratio >= 3) {
      score += 60;
      reasons.push(
        `Overdue: ${Math.round(s.daysSinceLastJob)} days since last visit vs their usual ~${Math.round(
          s.medianGapDays,
        )} days.`,
      );
    } else if (ratio >= 2) {
      score += 40;
      reasons.push(
        `Running late: ${Math.round(s.daysSinceLastJob)} days since last visit vs their usual ~${Math.round(
          s.medianGapDays,
        )} days.`,
      );
    }
  } else if (s.daysSinceLastJob >= 365) {
    score += 45;
    reasons.push(`Gone quiet: no visit in ${Math.round(s.daysSinceLastJob)} days.`);
  } else if (s.daysSinceLastJob >= 180) {
    score += 30;
    reasons.push(`Quiet: no visit in ${Math.round(s.daysSinceLastJob)} days.`);
  }

  if (s.jobCount >= 3 && score > 0) {
    score += 10;
    reasons.push('A repeat customer worth re-engaging.');
  }

  const finalScore = clamp(score);
  return { score: finalScore, level: level(finalScore), reasons };
}

/** The median gap (in days) between a sorted-ascending list of visit timestamps. 0 if fewer than 2. */
export function medianGapDays(sortedTimestamps: number[]): number {
  if (sortedTimestamps.length < 2) return 0;
  const gaps: number[] = [];
  for (let i = 1; i < sortedTimestamps.length; i++) {
    const prev = sortedTimestamps[i - 1] ?? 0;
    const cur = sortedTimestamps[i] ?? 0;
    gaps.push((cur - prev) / (1000 * 60 * 60 * 24));
  }
  gaps.sort((a, b) => a - b);
  const mid = Math.floor(gaps.length / 2);
  if (gaps.length % 2 === 1) return gaps[mid] ?? 0;
  return ((gaps[mid - 1] ?? 0) + (gaps[mid] ?? 0)) / 2;
}

/**
 * A DRAFT re-engagement message for an at-risk customer. Staff review and edit before sending — nothing
 * auto-sends. Deterministic and friendly; deliberately makes no promises about price or availability.
 */
export function draftReengagementMessage(displayName: string): string {
  const name = displayName.trim() || 'there';
  return (
    `Hi ${name}, it's been a while since we saw you — we'd love to help with anything you need. ` +
    `Reply here or give us a call and we'll sort out a time that suits you.`
  );
}
