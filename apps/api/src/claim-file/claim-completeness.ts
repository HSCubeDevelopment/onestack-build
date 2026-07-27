/**
 * Claim-pack completeness check. Pure; no DB, no Nest, no network.
 *
 * A claim file is assembled from data already flowing through the other modules — this doesn't re-capture
 * anything, it inspects what's PRESENT and reports the gaps, so they're closed before the pack goes to an
 * insurer or lawyer rather than bouncing back. `ready` is true only when no REQUIRED gap remains.
 *
 * It reads presence/absence, never the private values themselves.
 */
export type GapSeverity = 'required' | 'recommended' | 'info';

export interface ClaimGap {
  section: string;
  severity: GapSeverity;
  message: string;
}

/** The slice of the assembled claim file this check needs. The full ClaimFileView satisfies it. */
export interface CompletenessInput {
  claim: {
    claimNumber: string;
    authorisedAmountCents: number | null;
    excessCents: number | null;
  } | null;
  customer: { id: string } | null;
  insurer: { id: string } | null;
  vehicles: unknown[];
  photos: unknown[];
  quotes: { status: string }[];
  invoices: unknown[];
}

export function checkClaimCompleteness(v: CompletenessInput): { gaps: ClaimGap[]; ready: boolean } {
  const gaps: ClaimGap[] = [];
  const add = (section: string, severity: GapSeverity, message: string) =>
    gaps.push({ section, severity, message });

  // 1. Parties
  if (!v.customer) add('Parties', 'required', 'No customer / claimant on the file.');

  // 3/5. Claim & authorisation
  if (!v.claim || !v.claim.claimNumber.trim())
    add('Claim', 'required', 'No claim number recorded.');
  if (!v.insurer) add('Claim', 'recommended', 'No insurer recorded.');
  if (!v.claim || v.claim.authorisedAmountCents == null)
    add(
      'Authorisation',
      'recommended',
      'No insurer authority (authorised amount) recorded — capture the approval, not just the request.',
    );

  // 2. Vehicle
  if (v.vehicles.length === 0) add('Vehicle', 'required', 'No vehicle on the claim.');

  // 4. Damage evidence
  if (v.photos.length === 0) add('Damage evidence', 'required', 'No damage photos attached.');
  else if (v.photos.length < 4)
    add(
      'Damage evidence',
      'info',
      `Only ${v.photos.length} photo${v.photos.length === 1 ? '' : 's'} — insurers expect all angles (wide + close-up), plus VIN and odometer.`,
    );

  // 5/6. Quote
  if (v.quotes.length === 0) add('Quote', 'required', 'No estimate / quote on the file.');
  else if (!v.quotes.some((q) => q.status === 'Accepted' || q.status === 'Sent'))
    add('Quote', 'recommended', 'Quote is still a draft — not yet sent or authorised.');

  // 8. Financials
  if (!v.claim || v.claim.excessCents == null)
    add('Financials', 'recommended', 'Excess not recorded (amount + who pays).');
  if (v.invoices.length === 0) add('Financials', 'info', 'No final invoice yet.');

  const ready = !gaps.some((g) => g.severity === 'required');
  return { gaps, ready };
}
