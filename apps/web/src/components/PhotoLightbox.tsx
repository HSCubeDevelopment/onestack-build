'use client';
import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, Download, X, ZoomIn, ZoomOut } from 'lucide-react';

export interface LightboxPhoto {
  /** Where the full-size image is served from. */
  src: string;
  /** Shown under the image — rego, category, when it was taken. */
  caption?: string;
  /** Filename offered when the photo is saved. */
  fileName?: string;
}

/**
 * Full-screen photo viewer: expand, zoom, step through, download.
 *
 * Photos were previously plain <img> tags at their thumbnail size, so damage a shop is estimating from
 * could not actually be inspected — the detail that matters is exactly what a 90px tile hides.
 *
 * Zoom is a CSS transform on the already-loaded image rather than a re-fetch, so it is instant and costs
 * no extra bandwidth on a phone.
 */
export function PhotoLightbox({
  photos,
  index,
  onClose,
  onIndex,
}: {
  photos: LightboxPhoto[];
  index: number;
  onClose: () => void;
  onIndex: (i: number) => void;
}) {
  const [zoom, setZoom] = useState(1);
  const photo = photos[index];

  const step = useCallback(
    (delta: number) => {
      if (photos.length < 2) return;
      // Wrap, so a driver flicking through a set never hits a dead end.
      onIndex((index + delta + photos.length) % photos.length);
      setZoom(1);
    },
    [index, photos.length, onIndex],
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') step(1);
      if (e.key === 'ArrowLeft') step(-1);
      if (e.key === '+' || e.key === '=') setZoom((z) => Math.min(4, z + 0.5));
      if (e.key === '-') setZoom((z) => Math.max(1, z - 0.5));
    }
    window.addEventListener('keydown', onKey);
    // The page behind must not scroll while the viewer is open — on a phone that reads as the photo
    // sliding away under your finger.
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose, step]);

  if (!photo) return null;

  /*
   * Rendered into <body>, not where it was called from.
   *
   * `position: fixed` is only relative to the viewport while no ancestor establishes a containing
   * block — and any ancestor with a transform, filter or running transform animation does. The tow
   * cards animate in on a transform, which pinned this viewer inside a 398x414 card instead of
   * filling the screen. A portal puts it beyond the reach of whatever the caller's layout does, so
   * every gallery gets a full-screen viewer rather than the ones that happen to sit in plain boxes.
   */
  const overlay = (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Photo viewer"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        background: 'rgba(0,0,0,0.92)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Controls sit above the image and must not close the viewer when tapped. */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '10px 12px',
          color: '#fff',
          flex: 'none',
        }}
      >
        <span style={{ fontSize: 13, opacity: 0.8 }}>
          {index + 1} / {photos.length}
        </span>
        <span style={{ flex: 1 }} />
        <IconBtn label="Zoom out" onClick={() => setZoom((z) => Math.max(1, z - 0.5))}>
          <ZoomOut size={18} />
        </IconBtn>
        <IconBtn label="Zoom in" onClick={() => setZoom((z) => Math.min(4, z + 0.5))}>
          <ZoomIn size={18} />
        </IconBtn>
        <a
          href={photo.src}
          download={photo.fileName ?? 'photo.jpg'}
          aria-label="Download photo"
          onClick={(e) => e.stopPropagation()}
          style={{ ...btnStyle, display: 'inline-flex' }}
        >
          <Download size={18} />
        </a>
        <IconBtn label="Close" onClick={onClose}>
          <X size={18} />
        </IconBtn>
      </div>

      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'auto',
        }}
      >
        {photos.length > 1 && (
          <IconBtn
            label="Previous"
            onClick={(e) => {
              e.stopPropagation();
              step(-1);
            }}
          >
            <ChevronLeft size={22} />
          </IconBtn>
        )}
        <img
          src={photo.src}
          alt={photo.caption ?? 'Photo'}
          onClick={(e) => e.stopPropagation()}
          style={{
            maxWidth: '100%',
            maxHeight: '100%',
            objectFit: 'contain',
            transform: `scale(${zoom})`,
            transition: 'transform 120ms ease-out',
            cursor: zoom > 1 ? 'move' : 'zoom-in',
          }}
        />
        {photos.length > 1 && (
          <IconBtn
            label="Next"
            onClick={(e) => {
              e.stopPropagation();
              step(1);
            }}
          >
            <ChevronRight size={22} />
          </IconBtn>
        )}
      </div>

      {photo.caption && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{ color: '#fff', opacity: 0.85, fontSize: 13, padding: '10px 14px', flex: 'none' }}
        >
          {photo.caption}
        </div>
      )}
    </div>
  );

  // Guarded for the server pass, where there is no document to portal into.
  return typeof document === 'undefined' ? overlay : createPortal(overlay, document.body);
}

const btnStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.12)',
  color: '#fff',
  border: 'none',
  borderRadius: 10,
  // 40px keeps every control above the minimum comfortable touch target on a phone.
  width: 40,
  height: 40,
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  flex: 'none',
};

function IconBtn({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: (e: React.MouseEvent) => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      style={{ ...btnStyle, display: 'flex' }}
    >
      {children}
    </button>
  );
}

/** Track which photo in a set is open. Keeps the boilerplate out of every gallery. */
export function useLightbox() {
  const [index, setIndex] = useState<number | null>(null);
  return {
    index,
    open: (i: number) => setIndex(i),
    close: () => setIndex(null),
    setIndex,
    isOpen: index !== null,
  };
}
