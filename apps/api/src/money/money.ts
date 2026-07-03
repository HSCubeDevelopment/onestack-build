/**
 * Money is ALWAYS integer cents (never floats). Australian GST is 10%.
 * Two framings matter for AU invoicing:
 *   - GST-inclusive total → the GST component is total / 11 (because total = net × 1.1 = net × 11/10).
 *   - net (GST-exclusive)  → GST is net / 10, and the inclusive total is net + GST.
 * Rounding is half-up on the cent. These are the golden rules money tests pin down.
 */

export interface GstBreakdown {
  /** GST-exclusive amount, in cents. */
  net: number;
  /** GST component, in cents. */
  gst: number;
  /** GST-inclusive total, in cents (net + gst). */
  total: number;
}

function assertNonNegativeInt(cents: number, label: string): void {
  if (!Number.isInteger(cents) || cents < 0) {
    throw new RangeError(`${label} must be a non-negative integer number of cents, got ${cents}`);
  }
}

/** Round half-up to the nearest integer (away from zero). Inputs here are non-negative. */
export function roundHalfUp(value: number): number {
  return Math.floor(value + 0.5);
}

/** Break a GST-INCLUSIVE total into its net + GST parts. GST = round(total / 11). */
export function gstFromInclusive(totalCents: number): GstBreakdown {
  assertNonNegativeInt(totalCents, 'total');
  const gst = roundHalfUp(totalCents / 11);
  return { net: totalCents - gst, gst, total: totalCents };
}

/** Add GST to a NET (GST-exclusive) amount. GST = round(net / 10). */
export function gstFromNet(netCents: number): GstBreakdown {
  assertNonNegativeInt(netCents, 'net');
  const gst = roundHalfUp(netCents / 10);
  return { net: netCents, gst, total: netCents + gst };
}
