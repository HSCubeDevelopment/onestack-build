/**
 * Turn a typed address into a "take me there" link.
 *
 * The driver is holding a phone and needs turn-by-turn, not text to copy out. Apple Maps on Apple
 * hardware, Google Maps everywhere else — matching whatever is already the default app, so the tap
 * opens navigation rather than a web page they then have to re-share.
 *
 * Both URLs are plain public map links built ONLY from the address the office typed into the booking
 * form. No device position is read, sent, or stored to make one.
 */

/** True on iPhone/iPad/Mac, where Apple Maps is the system default. Safe during SSR (returns false). */
function isApplePlatform(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  // iPadOS 13+ reports as a Mac, so the touch check catches it too.
  return /iPhone|iPad|iPod|Macintosh/.test(ua);
}

/** A directions link for `address`, or null when there is no address to go to. */
export function directionsHref(address: string | null | undefined): string | null {
  const a = (address ?? '').trim();
  if (!a) return null;
  const q = encodeURIComponent(a);
  return isApplePlatform()
    ? `https://maps.apple.com/?daddr=${q}&dirflg=d`
    : `https://www.google.com/maps/dir/?api=1&destination=${q}`;
}

/** Which app the link will open, for labelling the control honestly. */
export function mapsAppName(): 'Apple Maps' | 'Google Maps' {
  return isApplePlatform() ? 'Apple Maps' : 'Google Maps';
}
