'use client';
import Link from 'next/link';
import { Car, Clock, Warehouse, Sparkles, ShieldAlert } from 'lucide-react';
import { AtLogo, SignOutButton } from '@/components/autotech/kit';

/**
 * The employee home — two big buttons and nothing else, exactly like the Auto Tech demo. Cars In / Out
 * opens the car flows; Clock In / Out opens the shift clock.
 */
export function StaffHome() {
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
          <p>Cars in &amp; out · your shift</p>
        </div>
      </div>

      <Link href="/inout" className="at-bigbtn at-grad-cars">
        <span className="circ">
          <Car size={54} strokeWidth={2} />
        </span>
        <span className="lab">Cars In / Out</span>
        <span className="sub">Car in for repair · loan car out</span>
      </Link>

      <Link href="/inout/estimate" className="at-bigbtn at-grad-estimate">
        <span className="circ">
          <Sparkles size={54} strokeWidth={2} />
        </span>
        <span className="lab">Instant estimate</span>
        <span className="sub">Photo the damage · AI parts &amp; price draft</span>
      </Link>

      <Link href="/inout/yards" className="at-bigbtn at-grad-yards">
        <span className="circ">
          <Warehouse size={54} strokeWidth={2} />
        </span>
        <span className="lab">Yards</span>
        <span className="sub">Cars parked in the yards · tow a car in</span>
      </Link>

      <Link href="/inout/ticket" className="at-bigbtn at-grad-ticket">
        <span className="circ">
          <ShieldAlert size={54} strokeWidth={2} />
        </span>
        <span className="lab">File a ticket</span>
        <span className="sub">Log a police / infringement notice on a car</span>
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
