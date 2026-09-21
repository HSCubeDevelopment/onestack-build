'use client';
import Link from 'next/link';
import { Truck, ClipboardList, Clock } from 'lucide-react';
import { AtLogo, SignOutButton } from '@/components/autotech/kit';
import { useMyTows } from '@/lib/tow';

/**
 * The tow driver's home — four buttons, nothing else.
 *
 * Dispatched work used to be listed inline here, which pushed everything below it off the screen as
 * soon as the driver had more than a job or two. It now lives on /tow/jobs and this page just carries
 * the count, so the home screen stays a launcher and the work gets a screen of its own.
 */
export function TowHome() {
  const { open } = useMyTows();

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

      {/* The work first — it is what the driver opened the app for. */}
      <Link href="/tow/jobs" className="at-bigbtn at-grad-jobs">
        {open.length > 0 && <span className="count">{open.length}</span>}
        <span className="circ">
          <ClipboardList size={54} strokeWidth={2} />
        </span>
        <span className="lab">Jobs</span>
        <span className="sub">
          {open.length === 0
            ? 'Cars you have been sent to collect'
            : `${open.length} car${open.length === 1 ? '' : 's'} to tow`}
        </span>
      </Link>

      <Link href="/yards" className="at-bigbtn at-grad-tow">
        <span className="circ">
          <Truck size={54} strokeWidth={2} />
        </span>
        <span className="lab">Tow in a car</span>
        <span className="sub">Collect a car · creates the job</span>
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
