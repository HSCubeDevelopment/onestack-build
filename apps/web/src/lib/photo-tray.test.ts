import { describe, expect, it } from 'vitest';
import {
  addToTray,
  emptyTray,
  isTrayEmpty,
  photosIn,
  removeFromTray,
  stagedPhoto,
  trayCount,
  trayUploads,
  uploadLabel,
  type PhotoTray,
} from './photo-tray';

type Cat = 'check_in' | 'progress' | 'handover';

/** A staged photo with a distinct id but a DUPLICATE file name — what a phone camera actually gives. */
const shot = (id: string, name = 'image.jpg') => stagedPhoto(id, `bytes-${id}`, 'image/jpeg', name);

describe('stagedPhoto', () => {
  it('derives a data: URL preview from the bytes', () => {
    const p = stagedPhoto('a', 'AAAA', 'image/png', 'front.png');
    expect(p.preview).toBe('data:image/png;base64,AAAA');
    expect(p.fileName).toBe('front.png');
  });
});

describe('counting', () => {
  it('starts empty', () => {
    expect(trayCount(emptyTray())).toBe(0);
    expect(isTrayEmpty(emptyTray())).toBe(true);
  });

  it('counts across every category, not just one', () => {
    let tray = emptyTray<Cat>();
    tray = addToTray(tray, 'check_in', [shot('1'), shot('2')]).tray;
    tray = addToTray(tray, 'handover', [shot('3')]).tray;
    expect(trayCount(tray)).toBe(3);
    expect(isTrayEmpty(tray)).toBe(false);
  });
});

describe('addToTray', () => {
  it('appends newest last, preserving capture order', () => {
    let tray = emptyTray<Cat>();
    tray = addToTray(tray, 'progress', [shot('1')]).tray;
    tray = addToTray(tray, 'progress', [shot('2'), shot('3')]).tray;
    expect(photosIn(tray, 'progress').map((p) => p.id)).toEqual(['1', '2', '3']);
  });

  it('takes everything when no cap is given', () => {
    const { tray, skipped } = addToTray(emptyTray<Cat>(), 'progress', [
      shot('1'),
      shot('2'),
      shot('3'),
    ]);
    expect(skipped).toBe(0);
    expect(trayCount(tray)).toBe(3);
  });

  it('caps the WHOLE tray, not the category, and reports the overflow', () => {
    let tray = emptyTray<Cat>();
    tray = addToTray(tray, 'check_in', [shot('1'), shot('2')], 3).tray;
    // 2 already staged under a different category, so only 1 of these 3 fits.
    const res = addToTray(tray, 'progress', [shot('3'), shot('4'), shot('5')], 3);
    expect(trayCount(res.tray)).toBe(3);
    expect(res.skipped).toBe(2);
    expect(photosIn(res.tray, 'progress').map((p) => p.id)).toEqual(['3']);
  });

  it('is a no-op that reports every photo skipped once full', () => {
    const full = addToTray(emptyTray<Cat>(), 'check_in', [shot('1')], 1).tray;
    const res = addToTray(full, 'progress', [shot('2')], 1);
    expect(res.tray).toBe(full); // same reference — nothing rebuilt
    expect(res.skipped).toBe(1);
  });

  it('does not mutate the tray it was given', () => {
    const before = addToTray(emptyTray<Cat>(), 'check_in', [shot('1')]).tray;
    const snapshot = JSON.stringify(before);
    addToTray(before, 'check_in', [shot('2')]);
    expect(JSON.stringify(before)).toBe(snapshot);
  });
});

describe('removeFromTray', () => {
  it('removes the photo with that id even when file names collide', () => {
    let tray = emptyTray<Cat>();
    // All three are called image.jpg — only the id can tell them apart.
    tray = addToTray(tray, 'progress', [shot('1'), shot('2'), shot('3')]).tray;
    tray = removeFromTray(tray, 'progress', '2');
    expect(photosIn(tray, 'progress').map((p) => p.id)).toEqual(['1', '3']);
  });

  it('drops the category once its last photo goes', () => {
    let tray: PhotoTray<Cat> = addToTray(emptyTray<Cat>(), 'handover', [shot('1')]).tray;
    tray = removeFromTray(tray, 'handover', '1');
    expect(trayCount(tray)).toBe(0);
    expect(Object.keys(tray)).toEqual([]);
  });

  it('is a no-op for an unknown id or an untouched category', () => {
    const tray = addToTray(emptyTray<Cat>(), 'progress', [shot('1')]).tray;
    expect(removeFromTray(tray, 'progress', 'nope')).toBe(tray);
    expect(removeFromTray(tray, 'handover', '1')).toBe(tray);
  });
});

describe('trayUploads', () => {
  const ORDER: readonly Cat[] = ['check_in', 'progress', 'handover'];

  it('follows the declared category order, not the order they were filled', () => {
    let tray = emptyTray<Cat>();
    // Filled back to front: handover first, check_in last.
    tray = addToTray(tray, 'handover', [shot('h1')]).tray;
    tray = addToTray(tray, 'check_in', [shot('c1'), shot('c2')]).tray;
    expect(trayUploads(tray, ORDER).map((u) => u.photo.id)).toEqual(['c1', 'c2', 'h1']);
  });

  it('pairs each photo with the category it was shot under', () => {
    let tray = emptyTray<Cat>();
    tray = addToTray(tray, 'check_in', [shot('c1')]).tray;
    tray = addToTray(tray, 'progress', [shot('p1')]).tray;
    expect(trayUploads(tray, ORDER)).toEqual([
      { key: 'check_in', photo: photosIn(tray, 'check_in')[0] },
      { key: 'progress', photo: photosIn(tray, 'progress')[0] },
    ]);
  });

  it('skips categories with nothing staged', () => {
    const tray = addToTray(emptyTray<Cat>(), 'progress', [shot('1')]).tray;
    expect(trayUploads(tray, ORDER)).toHaveLength(1);
  });

  it('is empty for an empty tray', () => {
    expect(trayUploads(emptyTray<Cat>(), ORDER)).toEqual([]);
  });
});

describe('uploadLabel', () => {
  it('words the batch for zero, one and many', () => {
    let tray = emptyTray<Cat>();
    expect(uploadLabel(tray)).toBe('Upload photos');
    tray = addToTray(tray, 'progress', [shot('1')]).tray;
    expect(uploadLabel(tray)).toBe('Upload 1 photo');
    tray = addToTray(tray, 'progress', [shot('2')]).tray;
    expect(uploadLabel(tray)).toBe('Upload 2 photos');
  });
});
