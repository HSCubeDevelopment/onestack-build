'use client';
import { ClipboardList, Wrench, Package, CircleCheck, Flag, type LucideIcon } from 'lucide-react';

/** Maps a job workflow state to a lucide icon + brand colour. */
export const STATE_META: Record<string, { Icon: LucideIcon; color: string }> = {
  Booked: { Icon: ClipboardList, color: '#2563eb' },
  InProgress: { Icon: Wrench, color: '#d97706' },
  AwaitingParts: { Icon: Package, color: '#7c3aed' },
  Ready: { Icon: CircleCheck, color: '#16a34a' },
  Collected: { Icon: Flag, color: '#64748b' },
};

export function StateIcon({ state, size = 16 }: { state: string; size?: number }) {
  const meta = STATE_META[state] ?? { Icon: ClipboardList, color: '#64748b' };
  const Ico = meta.Icon;
  return <Ico size={size} />;
}

export function stateColor(state: string): string {
  return STATE_META[state]?.color ?? '#64748b';
}
