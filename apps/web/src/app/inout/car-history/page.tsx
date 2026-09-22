'use client';
import { Suspense } from 'react';
import { CarHistory } from '@/components/autotech/CarHistory';

/** Car history — every action recorded against a car (photos, estimates, jobs, In/Out movements). */
export default function CarHistoryPage() {
  // useSearchParams needs a Suspense boundary in the app router.
  return (
    <Suspense fallback={null}>
      <CarHistory />
    </Suspense>
  );
}
