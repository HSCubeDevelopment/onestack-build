/**
 * The photo staging tray — capture many, review, upload once.
 *
 * Why this exists: a browser file input wired straight to an upload call means one photo per round
 * trip. With `capture="environment"` Android Chrome opens the camera directly and hands back exactly
 * ONE file (it ignores `multiple`), so a worker documenting a car had to tap → shoot → wait → tap
 * again for every angle. A tray holds the shots client-side instead, so the phone camera can be
 * re-opened as many times as the job needs and the whole set goes up on one deliberate action.
 *
 * Everything here is pure and id-driven so it can be unit tested without a DOM: the components own
 * the impure half (reading the File, compressing it, POSTing), this module owns the bookkeeping.
 */

/** One photo held in the tray, already compressed and ready to POST. */
export interface StagedPhoto {
  /**
   * Stable identity for React keys and removal. NOT the file name — phone cameras happily hand back
   * three files all called `image.jpg`, and removing by name or index would drop the wrong shot.
   */
  id: string;
  dataBase64: string;
  contentType: string;
  /**
   * Thumbnail source, as a `data:` URL built from the bytes we already hold. Deliberately not
   * `URL.createObjectURL`, which would need a matching `revokeObjectURL` on every remove, unmount and
   * upload — a leak waiting to happen in a screen whose whole point is churning through photos.
   */
  preview: string;
  fileName: string;
}

/**
 * Photos waiting to go up, grouped by the category they were shot under. A screen with no categories
 * (a job's attachments, a movement's before/after) just uses one fixed key.
 */
export type PhotoTray<K extends string = string> = Readonly<
  Partial<Record<K, readonly StagedPhoto[]>>
>;

/** An empty tray. A function, not a shared constant, so no caller can mutate the empty state. */
export function emptyTray<K extends string = string>(): PhotoTray<K> {
  return {} as PhotoTray<K>;
}

/** Build a tray entry, deriving the preview from the bytes. `id` is the caller's to supply. */
export function stagedPhoto(
  id: string,
  dataBase64: string,
  contentType: string,
  fileName: string,
): StagedPhoto {
  return {
    id,
    dataBase64,
    contentType,
    preview: `data:${contentType};base64,${dataBase64}`,
    fileName,
  };
}

/** How many photos are staged across every category. */
export function trayCount<K extends string>(tray: PhotoTray<K>): number {
  let n = 0;
  for (const key of Object.keys(tray) as K[]) n += tray[key]?.length ?? 0;
  return n;
}

export function isTrayEmpty<K extends string>(tray: PhotoTray<K>): boolean {
  return trayCount(tray) === 0;
}

/** The photos staged under one category, in the order they were taken. */
export function photosIn<K extends string>(
  tray: PhotoTray<K>,
  key: NoInfer<K>,
): readonly StagedPhoto[] {
  return tray[key] ?? [];
}

/**
 * Append photos to a category, newest last.
 *
 * `max` caps the WHOLE tray, not the category — it exists for screens with a hard upload ceiling
 * (the AI estimate takes at most 6). Anything over the cap is reported as `skipped` rather than
 * dropped silently, so the caller can tell the user why their last two shots didn't appear.
 */
export function addToTray<K extends string>(
  tray: PhotoTray<K>,
  key: NoInfer<K>,
  incoming: readonly StagedPhoto[],
  max?: number,
): { tray: PhotoTray<K>; skipped: number } {
  const room = max === undefined ? incoming.length : Math.max(0, max - trayCount(tray));
  const taken = incoming.slice(0, room);
  if (taken.length === 0) return { tray, skipped: incoming.length };
  return {
    tray: { ...tray, [key]: [...photosIn(tray, key), ...taken] },
    skipped: incoming.length - taken.length,
  };
}

/** Drop one staged photo. Unknown ids and unknown categories are no-ops, not errors. */
export function removeFromTray<K extends string>(
  tray: PhotoTray<K>,
  key: NoInfer<K>,
  id: string,
): PhotoTray<K> {
  const list = photosIn(tray, key);
  const next = list.filter((p) => p.id !== id);
  if (next.length === list.length) return tray;
  const out: Partial<Record<K, readonly StagedPhoto[]>> = { ...tray };
  // Drop the key entirely when its last photo goes, so `trayCount` and the upload list never have to
  // reason about empty buckets.
  if (next.length === 0) delete out[key];
  else out[key] = next;
  return out;
}

/**
 * Flatten the tray into the exact order the photos should be uploaded in.
 *
 * `order` pins the sequence to the screen's declared category list; without it, upload order would
 * follow JS object key order, which is insertion order — so the same set of photos would upload in a
 * different order depending on which category the worker happened to fill first.
 */
export function trayUploads<K extends string>(
  tray: PhotoTray<K>,
  order?: readonly NoInfer<K>[],
): readonly { key: K; photo: StagedPhoto }[] {
  const keys = order
    ? order.filter((k) => photosIn(tray, k).length > 0)
    : (Object.keys(tray) as K[]);
  return keys.flatMap((key) => photosIn(tray, key).map((photo) => ({ key, photo })));
}

/** The upload button's label, so every screen words the batch the same way. */
export function uploadLabel<K extends string>(tray: PhotoTray<K>): string {
  const n = trayCount(tray);
  if (n === 0) return 'Upload photos';
  return n === 1 ? 'Upload 1 photo' : `Upload ${n} photos`;
}
