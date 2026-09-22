import { Suspense } from 'react';
import { ServiceHistory } from '@/components/autotech/ServiceHistory';

/** A car's servicing record — dated visits, what was done, who owned it, and the photos. */
export default function ServiceHistoryPage() {
  // useSearchParams needs a Suspense boundary in the app router.
  return (
    <Suspense fallback={null}>
      <ServiceHistory />
    </Suspense>
  );
}
