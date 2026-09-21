'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Truck, ParkingSquare, PhoneCall, Warehouse } from 'lucide-react';
import { api } from '@/lib/api';
import { Yard, YardDrop } from '@/lib/yards';
import { useAsync } from '@/components/ui';
import { useYardTagCounts } from '@/lib/use-yard-tags';
import { AtTopbar, SignOutButton } from '@/components/autotech/kit';
import { BookTowModal } from '@/components/BookTowModal';

/**
 * The employee Yards home — the screen behind the "Yards" button. Two actions at the top (tow a car in,
 * park a car in a yard) and then the list of yards, each with a live count of how many cars are parked
 * there. Tapping a yard drills into the cars sitting in it. All reads/writes here are open to staff, so
 * a floor worker sees exactly this without needing owner access.
 *
 * Three actions, and the difference between the first two matters: "Book a tow" SENDS a driver out to
 * collect a car; "Tow a car in" records a pickup that has already happened. The front desk books tows,
 * not just the owner, so booking lives here rather than only on the owner's yards page.
 */
export function YardsHome() {
  const router = useRouter();
  const [booking, setBooking] = useState(false);
  const { data, loading, error } = useAsync(
    () => Promise.all([api.get<Yard[]>('/yards'), api.get<YardDrop[]>('/yards/awaiting')]),
    [],
  );
  const yards = data?.[0] ?? [];
  const tags = useYardTagCounts(data?.[0] ?? []);
  const awaiting = data?.[1] ?? [];

  // How many cars are parked in each yard right now — group the "in yard" drops by yard id.
  const countByYard = useMemo(() => {
    const c: Record<string, number> = {};
    for (const d of awaiting) c[d.yardId] = (c[d.yardId] ?? 0) + 1;
    return c;
  }, [awaiting]);

  return (
    <>
      <AtTopbar backHref="/" right={<SignOutButton />} />
      <div className="at-h2">Yards</div>

      <div className="at-tiles">
        <button type="button" className="at-tile" onClick={() => setBooking(true)}>
          <span className="ti-ic" style={{ background: 'var(--at-red)' }}>
            <PhoneCall size={30} strokeWidth={2} color="#fff" />
          </span>
          <span className="ti-lab">Book a tow</span>
          <span className="ti-sub">Send a driver to collect a car</span>
        </button>
        <Link href="/inout/yards/tow" className="at-tile">
          <span className="ti-ic" style={{ background: 'var(--at-orange)' }}>
            <Truck size={30} strokeWidth={2} color="#fff" />
          </span>
          <span className="ti-lab">Tow a car in</span>
          <span className="ti-sub">Collect a car · creates the job</span>
        </Link>
        <Link href="/inout/yards/park" className="at-tile">
          <span className="ti-ic" style={{ background: 'var(--at-blue)' }}>
            <ParkingSquare size={30} strokeWidth={2} color="#fff" />
          </span>
          <span className="ti-lab">Park a car</span>
          <span className="ti-sub">Drop a car at a yard</span>
        </Link>
      </div>

      {error && <div className="at-errbanner">Could not load yards.</div>}
      {loading ? (
        <div className="at-spin">Loading…</div>
      ) : yards.length === 0 ? (
        <div className="at-empty">No yards set up yet — ask the owner to add one.</div>
      ) : (
        <div className="at-list">
          {yards.map((y) => {
            const logged = countByYard[y.id] ?? 0;
            // A yard drop is a record someone made; a tag is where the car physically is. Show the
            // second as the headline — it reads 0 for every yard until staff start logging drops,
            // which is what made these screens look empty while 59 cars sat in the yards.
            const here = tags.countByYard[y.id] ?? 0;
            const n = tags.configured ? here : logged;
            return (
              <div
                key={y.id}
                className="at-lrow"
                onClick={() => router.push(`/inout/yards/${y.id}`)}
              >
                <span className="ic" style={{ background: 'var(--at-purple)' }}>
                  <Warehouse size={22} strokeWidth={2} color="#fff" />
                </span>
                <div className="body">
                  <div className="ti">{y.name}</div>
                  <div className="st">
                    {tags.configured
                      ? `${here === 0 ? 'No cars' : here === 1 ? '1 car' : `${here} cars`} here now · ${logged} logged`
                      : logged === 0
                        ? 'No cars parked'
                        : logged === 1
                          ? '1 car parked'
                          : `${logged} cars parked`}
                  </div>
                </div>
                <span className={`at-badge ${n > 0 ? 'amber' : 'gray'}`}>{n}</span>
              </div>
            );
          })}
        </div>
      )}

      {booking && (
        <BookTowModal
          yards={yards}
          onClose={() => setBooking(false)}
          onBooked={() => setBooking(false)}
        />
      )}
    </>
  );
}
