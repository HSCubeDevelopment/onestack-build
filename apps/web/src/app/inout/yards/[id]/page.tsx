'use client';
import { useParams } from 'next/navigation';
import { YardDetail } from '@/components/autotech/YardDetail';

/** The cars parked in one yard, with a "move to workshop" action on each. */
export default function YardDetailPage() {
  const { id } = useParams<{ id: string }>();
  return <YardDetail yardId={id} />;
}
