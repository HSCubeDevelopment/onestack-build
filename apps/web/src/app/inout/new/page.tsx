'use client';
import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { MovementForm, MoveKind } from '@/components/autotech/MovementForm';

const KINDS: MoveKind[] = ['in', 'out', 'back', 'return'];

function NewMovement() {
  const params = useSearchParams();
  const raw = params.get('kind') ?? 'out';
  const kind = (KINDS.includes(raw as MoveKind) ? raw : 'out') as MoveKind;
  return <MovementForm kind={kind} />;
}

/** A car movement — one of the four Cars-menu flows (in / out / back / return). */
export default function NewMovementPage() {
  return (
    <Suspense fallback={null}>
      <NewMovement />
    </Suspense>
  );
}
