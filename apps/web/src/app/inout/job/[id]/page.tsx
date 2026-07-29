import { JobDetail } from '@/components/autotech/JobDetail';

/** Employee job-details page — opened from Car history. Shows everything the job entails (mobile view). */
export default function JobDetailPage({ params }: { params: { id: string } }) {
  return <JobDetail jobId={params.id} />;
}
