'use client';
import { useMemo, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { AtTopbar, SignOutButton } from '@/components/autotech/kit';
import { TowJobCard } from '@/components/autotech/TowJobCard';
import { isOpenTow, useMyTows } from '@/lib/tow';

/**
 * The tow driver's jobs screen — the cars they have to move.
 *
 * Its own screen rather than a strip on the home page: a driver working a full list was scrolling past
 * their other buttons to reach job three, and a list that long has no business sharing a page with the
 * clock-in button.
 *
 * Open work first, in the order it was dispatched. Finished tows stay reachable behind a toggle so a
 * driver can check what they did and what photos they took, without that filling the screen.
 */
export function TowJobs() {
  const { jobs, open, error, reload } = useMyTows();
  const [showDone, setShowDone] = useState(false);

  const done = useMemo(() => (jobs ?? []).filter((j) => !isOpenTow(j)), [jobs]);

  return (
    <>
      <AtTopbar backHref="/" right={<SignOutButton />} />
      <div className="at-h2">Jobs</div>
      <p className="at-muted" style={{ margin: '2px 0 16px' }}>
        {jobs === null
          ? 'Loading your jobs…'
          : open.length === 0
            ? 'Nothing to tow right now.'
            : `${open.length} car${open.length === 1 ? '' : 's'} to tow`}
      </p>

      {error && <div className="at-errbanner">{error}</div>}

      {jobs !== null && open.length === 0 && !error && (
        <div className="at-empty">
          <CheckCircle2 size={34} strokeWidth={1.8} style={{ opacity: 0.4 }} />
          <div style={{ marginTop: 8 }}>
            You are all clear. New jobs show up here as soon as the office books them.
          </div>
        </div>
      )}

      {open.map((j) => (
        <TowJobCard key={j.jobId} job={j} onChanged={reload} />
      ))}

      {done.length > 0 && (
        <>
          <button
            className="at-chip"
            style={{ marginTop: 18 }}
            onClick={() => setShowDone((v) => !v)}
          >
            {showDone ? 'Hide' : 'Show'} finished <span className="n">{done.length}</span>
          </button>
          {showDone && (
            <div style={{ marginTop: 12 }}>
              {done.map((j) => (
                <TowJobCard key={j.jobId} job={j} onChanged={reload} />
              ))}
            </div>
          )}
        </>
      )}
    </>
  );
}
