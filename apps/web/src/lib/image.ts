/**
 * Client-side image downscale → base64. Shrinks a captured photo to at most 1600px on the long edge and
 * re-encodes it as JPEG before upload, so phone photos don't blow out request size (or the vision API's
 * token cost). Falls back to the raw bytes if the canvas path isn't available. Returns base64 with no
 * `data:` prefix — the shape both /fleet/photos and /estimates/from-photos expect.
 */
export async function compressToBase64(
  file: File,
  maxEdge = 1600,
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
    const out = canvas.toDataURL('image/jpeg', 0.82);
    return { dataBase64: out.split(',')[1] ?? '', contentType: 'image/jpeg' };
  } catch {
    return { dataBase64: dataUrl.split(',')[1] ?? '', contentType: file.type || 'image/jpeg' };
  }
}
