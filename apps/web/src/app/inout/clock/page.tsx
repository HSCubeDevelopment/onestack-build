'use client';
import { ClockInOut } from '@/components/autotech/ClockInOut';

/** The shift clock — shared by STAFF and TOW (both reach it from their home). */
export default function ClockPage() {
  return <ClockInOut backHref="/" />;
}
