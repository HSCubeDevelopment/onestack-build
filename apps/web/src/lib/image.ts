import { drawStamp, type StampText } from './photo-stamp';

/**
 * Client-side image downscale → base64. Shrinks a captured photo to at most 1600px on the long edge and
 * re-encodes it as JPEG before upload, so phone photos don't blow out request size (or the vision API's
 * token cost). Falls back to the raw bytes if the canvas path isn't available. Returns base64 with no
 * `data:` prefix — the shape both /fleet/photos and /estimates/from-photos expect.
 */
/**
 * Read any file (PDF, image, …) as base64 with no `data:` prefix and no re-encoding — the shape the API's
 * file endpoints expect. Use for PDFs and other non-image files where `compressToBase64` (which downscales
 * via a canvas) doesn't apply. Rejects if the file can't be read.
 */
export async function fileToBase64(
  file: File,
): Promise<{ dataBase64: string; contentType: string }> {
  const dataUrl = await new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(new Error('Could not read the file'));
    r.readAsDataURL(file);
  });
  return {
    dataBase64: dataUrl.split(',')[1] ?? '',
    contentType: file.type || 'application/octet-stream',
  };
}

/**
 * Optionally burn a time-and-place caption into the image before it is encoded.
 *
 * Only passed for tow photos. Everything else is unstamped, keeping the app's normal stance that a
 * position is not recorded — see lib/photo-stamp.ts for why this is a deliberate exception.
 */
export async function compressToBase64(
  file: File,
  maxEdge = 1600,
  stamp?: StampText,
): Promise<{ dataBase64: string; contentType: string }> {
  const dataUrl = await new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(new Error('Could not read the file'));
    r.readAsDataURL(file);
  });
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error('image'));
      i.src = dataUrl;
    });
    let { width: w, height: h } = img;
    if (w > maxEdge || h > maxEdge) {
      const s = Math.min(maxEdge / w, maxEdge / h);
      w = Math.round(w * s);
      h = Math.round(h * s);
    }
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no canvas');
    ctx.drawImage(img, 0, 0, w, h);
    // After the draw, so it sits on top of the photo rather than being scaled with it.
    if (stamp) drawStamp(ctx, w, h, stamp);
    const out = canvas.toDataURL('image/jpeg', 0.82);
    return { dataBase64: out.split(',')[1] ?? '', contentType: 'image/jpeg' };
  } catch {
    // Canvas unavailable — the photo still uploads, just without the stamp. Losing the caption is
    // recoverable; losing the photo the driver just took is not.
    return { dataBase64: dataUrl.split(',')[1] ?? '', contentType: file.type || 'image/jpeg' };
  }
}
