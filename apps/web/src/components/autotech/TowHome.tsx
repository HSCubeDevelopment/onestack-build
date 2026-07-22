'use client';
import Link from 'next/link';
import { Truck, ClipboardList, Clock } from 'lucide-react';
import { AtLogo, SignOutButton } from '@/components/autotech/kit';

/**
 * The tow driver's home — the same Auto Tech look as the staff home, but surfacing the tow worker's
 * OWN functions. Nothing about what these do changes: "Tow in a car" opens the existing yards tow-in
 * flow, "My jobs" the existing assigned-jobs list, "Clock In / Out" the shift clock.
 */
export function TowHome() {
  return (
    <>
      <div className="at-topbar">
        <span />
        <SignOutButton />
      </div>

      <div className="at-brand">
        <AtLogo />
        <div>
          <h1>Auto Tech</h1>
          <p>Tow driver</p>
        </div>
      </div>

      <Link href="/yards" className="at-bigbtn at-grad-tow">
        <span className="circ">
          <Truck size={54} strokeWidth={2} />
        </span>
        <span className="lab">Tow in a car</span>
        <span className="sub">Collect a car · creates the job</span>
      </Link>

      <Link href="/jobs" className="at-bigbtn at-grad-jobs">
        <span className="circ">
          <ClipboardList size={54} strokeWidth={2} />
        </span>
        <span className="lab">My jobs</span>
        <span className="sub">Jobs assigned to you</span>
      </Link>

      <Link href="/inout/clock" className="at-bigbtn at-grad-clock">
        <span className="circ">
          <Clock size={54} strokeWidth={2} />
        </span>
        <span className="lab">Clock In / Out</span>
        <span className="sub">Start &amp; finish your shift</span>
      </Link>
    </>
  );
}
