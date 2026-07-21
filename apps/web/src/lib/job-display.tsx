/**
 * How a panel shop identifies a car on screen — shared by the owner home, the jobs list and the board.
 *
 * Before this existed the owner home carried its own private copies of `regoOf`, `stageTint` and
 * `humanizeState`, and the jobs list and board carried nothing — so a job on the home screen looked
 * like a car (plate + coloured status) and the SAME job on the jobs list looked like a spreadsheet row.
 * One source means the three surfaces agree, and the prototype's rule — a car is its PLATE and its
 * STATUS COLOUR, in that order — holds everywhere.
 */
import type { BoardCard } from '@/lib/api';

/**
 * Pull the plate out of a vehicle label.
 *
 * The backend composes a subject label as `${make} ${model} (${rego})` (see contacts.controller),
 * and the board read-model has already joined the vehicle onto the card. Parsing the trailing
 * parenthesis is cheaper than a second round trip per row.
 */
export function regoOf(label: string | null | undefined): string | null {
  const rego = label?.match(/\(([^)]+)\)\s*$/)?.[1]?.trim();
  return rego ? rego.toUpperCase() : null;
}

/** The make + model, i.e. the label with the trailing "(rego)" removed. */
export function makeModelOf(label: string | null | undefined): string | null {
  const s = label?.replace(/\s*\([^)]*\)\s*$/, '').trim();
  return s || null;
}

/** Rego straight off a board card (its vehicleLabel is the joined subject label). */
export function regoOfCard(card: BoardCard): string | null {
  return regoOf(card.vehicleLabel);
}

/**
 * The prototype's fixed status palette: same state, same colour, everywhere. Keys are normalised
 * (spaces/underscores/case removed) so `AwaitingParts`, `awaiting_parts` and `Awaiting parts` all land
 * on the same colour. Returns a CSS custom-property reference so light and dark themes both work.
 */
export function stageTint(state: string): string {
  const key = state.toLowerCase().replace(/[\s_-]/g, '');
  const table: Record<string, string> = {
    booked: 'var(--text-dim)',
    inprogress: 'var(--amber)',
    awaitingparts: 'var(--purple)',
    ready: 'var(--green)',
    collected: 'var(--blue)',
    towed: 'var(--purple)',
  };
  return table[key] ?? 'var(--text-dim)';
}

/** "AwaitingParts" is a machine name; a person reads "Awaiting parts". */
export function humanizeState(state: string): string {
  const spaced = state.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}

/** The black-and-yellow plate. A recognisable object, not a text label. */
export function RegoPlate({ rego }: { rego: string | null | undefined }) {
  if (!rego) return null;
  return <span className="rego-plate">{rego}</span>;
}

/** A coloured status pill, tinted by state per the fixed palette. */
export function StatePill({ state }: { state: string }) {
  return (
    <span className="status-pill" style={{ background: stageTint(state) }}>
      {humanizeState(state)}
    </span>
  );
}
