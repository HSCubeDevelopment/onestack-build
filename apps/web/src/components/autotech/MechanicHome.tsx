'use client';
import Link from 'next/link';
import { Wrench, History, Clock, UserCog } from 'lucide-react';
import { AtLogo, SignOutButton, useMe } from '@/components/autotech/kit';

/**
 * The mechanics' home (Manga, Jot).
 *
 * The shared employee home leads with Cars In/Out, repair photos and yards — none of which they
 * touch. They service cars: one car at a time, photographed before and after, with a list of what was
 * done. So the home is that job, made unmissable, and the rest is what they genuinely use.
 *
 * Same access as any other employee. This is which buttons they see, not what they are allowed to do.
 */
export function MechanicHome() {
  const me = useMe();

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
          <p>Mechanic{me?.role ? '' : ''}</p>
        </div>
      </div>

      <Link href="/inout/work" className="at-bigbtn at-grad-photos">
        <span className="circ">
          <Wrench size={54} strokeWidth={2} />
        </span>
        <span className="lab">Log work</span>
        <span className="sub">Before &amp; after photos · what was done</span>
      </Link>

      <Link href="/inout/car-history" className="at-bigbtn at-grad-history">
        <span className="circ">
          <History size={54} strokeWidth={2} />
        </span>
        <span className="lab">Car history</span>
        <span className="sub">Everything recorded on a rego</span>
      </Link>

      <Link href="/inout/clock" className="at-bigbtn at-grad-clock">
        <span className="circ">
          <Clock size={54} strokeWidth={2} />
        </span>
        <span className="lab">Clock In / Out</span>
        <span className="sub">Start &amp; finish your shift</span>
      </Link>

      <Link href="/inout/me" className="at-bigbtn at-grad-me">
        <span className="circ">
          <UserCog size={54} strokeWidth={2} />
        </span>
        <span className="lab">My profile</span>
        <span className="sub">Your details &amp; PIN</span>
      </Link>
    </>
  );
}
