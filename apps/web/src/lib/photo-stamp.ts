/**
 * Burning a time and place onto a photo.
 *
 * ⚠️ THIS STORES A LOCATION, WHICH THE REST OF THE APP DELIBERATELY DOES NOT.
 * 0047_time_entry_geofence.sql keeps a verdict and a distance but no coordinates; 0048_yards.sql says
 * the driver's live position is never stored; tow.dto.ts repeats it. A stamped photo is different in
 * kind — the place is drawn into the pixels, so it survives export, sharing and any later deletion of
 * the row. That is the point for a tow condition record (it is evidence of where a car was and when),
 * but it is a deliberate exception, not the house rule.
 *
 * Only tow photos are stamped. Nothing else calls this.
 *
 * The position is best-effort: if the driver denies location, or the fix or the lookup fails, the photo
 * is still taken and still stamped with the time. A missing address is better than a lost photo, and
 * pretending to know a place we do not is worse than both.
 */
import { getBrowserPosition } from './api';

export interface StampText {
  /** Local time, written out — never a bare timestamp the reader has to decode. */
  when: string;
  /** Street address if we could resolve one, else coordinates, else null. */
  where: string | null;
}

/** Reverse-geocode a fix to a street address. Returns null on any failure — never throws. */
async function addressFor(lat: number, lng: number): Promise<string | null> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&zoom=18&lat=${lat}&lng=${lng}`,
      { headers: { Accept: 'application/json' } },
    );
    if (!res.ok) return null;
    const j = (await res.json()) as { address?: Record<string, string> };
    const a = j.address ?? {};
    const parts = [
      [a.house_number, a.road].filter(Boolean).join(' '),
      a.suburb ?? a.city ?? a.town,
      a.state,
    ].filter((p): p is string => Boolean(p && p.trim()));
    return parts.length ? parts.join(', ') : null;
  } catch {
    return null;
  }
}

/** What to draw on a photo taken right now, here. */
export async function buildStamp(): Promise<StampText> {
  const when = new Date().toLocaleString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  const pos = await getBrowserPosition();
  if (!pos) return { when, where: null };
  const address = await addressFor(pos.latitude, pos.longitude);
  return {
    // Fall back to coordinates rather than nothing: a driver can still prove where they were.
    where: address ?? `${pos.latitude.toFixed(5)}, ${pos.longitude.toFixed(5)}`,
    when,
  };
}

/**
 * Draw the stamp into the bottom-left of a canvas, scaled to the image so it stays legible on a phone
 * photo and on a 1600px downscale alike. White on a translucent black band, because a car photo can be
 * any colour underneath.
 */
export function drawStamp(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  stamp: StampText,
): void {
  const lines = [stamp.when, stamp.where].filter((l): l is string => Boolean(l));
  if (lines.length === 0) return;

  const size = Math.max(12, Math.round(width / 38));
  const pad = Math.round(size * 0.6);
  const lineHeight = Math.round(size * 1.35);
  const bandHeight = lineHeight * lines.length + pad * 2;

  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(0, height - bandHeight, width, bandHeight);

  ctx.font = `600 ${size}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'top';
  lines.forEach((line, i) => {
    ctx.fillText(line, pad, height - bandHeight + pad + i * lineHeight, width - pad * 2);
  });
  ctx.restore();
}
