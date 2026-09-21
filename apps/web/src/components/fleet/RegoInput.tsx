'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { FleetVehicle, vehicleStatusLabel } from '@/lib/fleet';

/**
 * A registration field that suggests real cars as you type.
 *
 * Typing a plate from memory is how the wrong car ends up on a job: 1CW8ZV and 1CW8ZY are one glyph
 * apart, and the old field accepted either in silence, then reported "no car found" (or worse, found
 * the other one). Showing the matches lets someone pick the plate they meant instead of spelling it.
 *
 * The whole vehicle list is fetched ONCE per page load and matched in the browser. There is no
 * prefix-search endpoint — `/fleet/vehicles/lookup` resolves one exact rego — and a request per
 * keystroke against 1,374 cars would be far worse than the single list this already loads elsewhere.
 */

let cache: Promise<FleetVehicle[]> | null = null;
/** One in-flight/complete fetch shared by every rego field on the page. */
function allVehicles(): Promise<FleetVehicle[]> {
  cache ??= api.get<FleetVehicle[]>('/fleet/vehicles').catch(() => {
    cache = null; // let the next field retry rather than caching a failure forever
    return [];
  });
  return cache;
}

const MAX_SUGGESTIONS = 8;

export function RegoInput({
  value,
  onChange,
  onPick,
  onEnter,
  placeholder = '1XY 4KP',
  autoFocus,
  label,
}: {
  value: string;
  onChange: (rego: string) => void;
  /** Fired when a suggestion is chosen — use it to run the search straight away. */
  onPick?: (rego: string) => void;
  /** Fired on Enter when no suggestion is highlighted. */
  onEnter?: () => void;
  placeholder?: string;
  autoFocus?: boolean;
  /** Renders the standard field label above the input when given. */
  label?: string;
}) {
  const [vehicles, setVehicles] = useState<FleetVehicle[]>([]);
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(-1);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let live = true;
    void allVehicles().then((v) => live && setVehicles(v));
    return () => {
      live = false;
    };
  }, []);

  // Close when the tap lands outside — on a phone there is no Escape key.
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent | TouchEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', away);
    document.addEventListener('touchstart', away);
    return () => {
      document.removeEventListener('mousedown', away);
      document.removeEventListener('touchstart', away);
    };
  }, [open]);

  const matches = useMemo(() => {
    // Plates get typed with spaces and dashes; the stored rego has neither.
    const q = value.replace(/[^A-Z0-9]/gi, '').toUpperCase();
    if (!q) return [];
    const starts: FleetVehicle[] = [];
    const contains: FleetVehicle[] = [];
    for (const v of vehicles) {
      const r = v.rego.toUpperCase();
      if (r === q) continue; // an exact match needs no suggesting
      if (r.startsWith(q)) starts.push(v);
      else if (r.includes(q)) contains.push(v);
      if (starts.length >= MAX_SUGGESTIONS) break;
    }
    // Plates that START with what was typed are what someone is reaching for.
    return [...starts, ...contains].slice(0, MAX_SUGGESTIONS);
  }, [vehicles, value]);

  const show = open && matches.length > 0;

  function choose(rego: string) {
    onChange(rego);
    setOpen(false);
    setCursor(-1);
    onPick?.(rego);
  }

  return (
    <div className="at-field at-regofield" ref={box}>
      {label && <div className="at-flabel">{label}</div>}
      <input
        className="at-input rego"
        value={value}
        onChange={(e) => {
          onChange(e.target.value.toUpperCase());
          setOpen(true);
          setCursor(-1);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' && show) {
            e.preventDefault();
            setCursor((c) => (c + 1) % matches.length);
          } else if (e.key === 'ArrowUp' && show) {
            e.preventDefault();
            setCursor((c) => (c <= 0 ? matches.length - 1 : c - 1));
          } else if (e.key === 'Escape') {
            setOpen(false);
          } else if (e.key === 'Enter') {
            const hit = show && cursor >= 0 ? matches[cursor] : undefined;
            if (hit) {
              e.preventDefault();
              choose(hit.rego);
            } else {
              setOpen(false);
              onEnter?.();
            }
          }
        }}
        placeholder={placeholder}
        autoFocus={autoFocus}
        autoCapitalize="characters"
        autoCorrect="off"
        autoComplete="off"
        spellCheck={false}
        role="combobox"
        aria-expanded={show}
        aria-autocomplete="list"
        aria-controls="rego-suggestions"
      />

      {show && (
        <ul className="at-regolist" id="rego-suggestions" role="listbox">
          {matches.map((v, i) => (
            <li key={v.id}>
              <button
                type="button"
                role="option"
                aria-selected={i === cursor}
                className={`at-regoitem${i === cursor ? ' on' : ''}`}
                // mousedown, not click: the input's blur would close the list first.
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(v.rego);
                }}
              >
                <span className="r">{v.rego}</span>
                <span className="m">
                  {[v.make, v.model].filter(Boolean).join(' ') || 'Car on record'}
                </span>
                <span className="s">{vehicleStatusLabel[v.status]}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
