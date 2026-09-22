'use client';
import { useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Camera, Phone, User, Wrench } from 'lucide-react';
import { api } from '@/lib/api';
import { useAsync } from '@/components/ui';
import { AtTopbar, SignOutButton } from '@/components/autotech/kit';
import { PhotoLightbox, useLightbox, type LightboxPhoto } from '@/components/PhotoLightbox';

interface ServiceRecord {
  ref: string;
  at: string;
  work: string[];
  customer: { name: string | null; phone: string | null } | null;
  photos: { id: string; fileName: string; at: string }[];
}
interface SubjectView {
  id: string;
  label: string;
  fields: Record<string, unknown>;
}

const longDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-AU', {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

/**
 * A car's servicing, as a record the shop owns rather than a chat log.
 *
 * The history was backfilled from the mechanics' WhatsApp group, and the raw form of it — a marker
 * line, a ref, then the work — is not something anyone should have to read. Behind this screen the
 * data is still those notes; in front of it, each visit is a dated card with the jobs listed, the
 * customer who brought it in, and the photos taken that day.
 *
 * Every photo opens full screen: pinch or tap to zoom, swipe between them.
 */
export function ServiceHistory() {
  const router = useRouter();
  const params = useSearchParams();
  const vehicleId = params.get('vehicleId') ?? '';
  const rego = (params.get('rego') ?? '').toUpperCase();

  const { data, loading, error } = useAsync(
    () =>
      Promise.all([
        api.get<ServiceRecord[]>(`/vehicle-profile/${vehicleId}/service-history`),
        api.getOr<{ vehicle: SubjectView } | null>(`/vehicle-profile/${vehicleId}`, null),
      ]),
    [vehicleId],
  );

  const records = data?.[0] ?? [];
  const vehicle = data?.[1]?.vehicle;

  // One flat set so the viewer can run the whole car's photo album end to end, newest visit first.
  const album: LightboxPhoto[] = useMemo(
    () =>
      records.flatMap((r) =>
        r.photos.map((p) => ({
          src: `/api/backend/vehicle-profile/${vehicleId}/photos/${p.id}/content`,
          caption: `${rego || vehicle?.label || 'Car'} · ${longDate(r.at)}${
            r.work.length ? ` · ${r.work.join(', ')}` : ''
          }`,
          fileName: p.fileName,
        })),
      ),
    [records, vehicleId, rego, vehicle],
  );

  /** Where a visit's photos start within the flat album, so tapping opens the right one. */
  const offsets = useMemo(() => {
    const out: number[] = [];
    let n = 0;
    for (const r of records) {
      out.push(n);
      n += r.photos.length;
    }
    return out;
  }, [records]);

  const lightbox = useLightbox();
  const totalPhotos = album.length;

  return (
    <>
      {/* Back to the CAR, not to an empty search box. The rego is carried in the URL so the record
          reloads with everything else on it — photos, live location, activity. */}
      <AtTopbar
        backHref={
          rego ? `/inout/car-history?rego=${encodeURIComponent(rego)}` : '/inout/car-history'
        }
        right={<SignOutButton />}
      />

      <div className="sv-head">
        <div className="sv-rego">{rego || vehicle?.label || 'Car'}</div>
        {vehicle && (
          <div className="sv-car">
            {[vehicle.fields.year, vehicle.fields.make, vehicle.fields.model]
              .filter((x) => x && x !== 'Unknown')
              .join(' ')}
          </div>
        )}
      </div>

      {!loading && records.length > 0 && (
        <div className="sv-summary">
          <span>
            <b>{records.length}</b> service{records.length === 1 ? '' : 's'}
          </span>
          <span className="dot">·</span>
          <span>
            <b>{totalPhotos}</b> photo{totalPhotos === 1 ? '' : 's'}
          </span>
          <span className="dot">·</span>
          <span>last {longDate(records[0]!.at).replace(/^\w+,\s/, '')}</span>
        </div>
      )}

      {error && <div className="at-errbanner">Could not load the service history.</div>}
      {loading ? (
        <div className="at-spin">Loading…</div>
      ) : records.length === 0 ? (
        <div className="at-empty">Nothing recorded for this car yet.</div>
      ) : (
        records.map((r, i) => (
          <div key={r.ref || r.at} className="sv-card">
            <div className="sv-when">{longDate(r.at)}</div>

            {r.work.length > 0 ? (
              <ul className="sv-work">
                {r.work.map((w, j) => (
                  <li key={j}>
                    <Wrench size={13} />
                    <span>{w}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="sv-nowork">No description was written — photos only.</p>
            )}

            {r.customer && (r.customer.name || r.customer.phone) && (
              <div className="sv-cust">
                {r.customer.name && (
                  <span className="who">
                    <User size={13} /> {r.customer.name}
                  </span>
                )}
                {r.customer.phone && (
                  // On a phone this is the fastest way back to the owner.
                  <a className="at-link" href={`tel:${r.customer.phone.replace(/\s/g, '')}`}>
                    <Phone size={13} /> {r.customer.phone}
                  </a>
                )}
              </div>
            )}

            {r.photos.length > 0 && (
              <>
                <div className="sv-photolabel">
                  <Camera size={13} /> {r.photos.length} photo{r.photos.length === 1 ? '' : 's'}
                </div>
                <div className="sv-strip">
                  {r.photos.map((p, j) => (
                    <button
                      key={p.id}
                      className="sv-thumb"
                      onClick={() => lightbox.open((offsets[i] ?? 0) + j)}
                      aria-label={`Open photo ${j + 1} of ${r.photos.length}`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`/api/backend/vehicle-profile/${vehicleId}/photos/${p.id}/content`}
                        alt={`Service photo ${j + 1}`}
                        loading="lazy"
                      />
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        ))
      )}

      {records.length > 0 && (
        <button
          className="at-btn ghost"
          style={{ marginTop: 18 }}
          onClick={() =>
            router.push(
              rego ? `/inout/car-history?rego=${encodeURIComponent(rego)}` : '/inout/car-history',
            )
          }
        >
          Back to {rego || 'the car'}
        </button>
      )}

      {lightbox.isOpen && album.length > 0 && (
        <PhotoLightbox
          photos={album}
          index={lightbox.index ?? 0}
          onClose={lightbox.close}
          onIndex={lightbox.setIndex}
        />
      )}
    </>
  );
}
