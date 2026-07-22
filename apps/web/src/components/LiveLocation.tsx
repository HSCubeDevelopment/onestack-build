'use client';
import { useEffect, useState } from 'react';
import { MapPin, BatteryMedium, Clock, ExternalLink } from 'lucide-react';
import { api } from '@/lib/api';

/**
 * Live location (CityTag, migration plan §9). Shows a fleet car's last-known position on an
 * OpenStreetMap map with its address, last-update time and tag battery. Degrades cleanly to an empty
 * state when there's no recent fix or CityTag isn't connected. Location is crowd-sourced/approximate —
 * it only refreshes when a phone passes near the tag — so the "approximate" note stays visible.
 */
interface TagLocation {
  rego: string;
  name: string;
  lat: number | null;
  lng: number | null;
  time: string | null;
  battery: number | null;
  address: string;
}
interface TrackingResult {
  configured: boolean;
  device: TagLocation | null;
  error?: string;
}

export function LiveLocation({ rego }: { rego: string }) {
  const [res, setRes] = useState<TrackingResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    api
      .getOr<TrackingResult>(`/tracking/location?rego=${encodeURIComponent(rego)}`, {
        configured: false,
        device: null,
      })
      .then((r) => alive && setRes(r))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [rego]);

  const dev = res?.device;
  const hasFix = !!dev && dev.lat !== null && dev.lng !== null;

  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <div className="card-head">
        <h2 style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <MapPin size={16} /> Live location
        </h2>
      </div>

      {loading ? (
        <div className="faint" style={{ padding: '18px 2px', fontSize: 13 }}>
          Checking the tag…
        </div>
      ) : hasFix ? (
        <>
          <div
            style={{
              borderRadius: 12,
              overflow: 'hidden',
              border: '1px solid var(--border)',
              aspectRatio: '16 / 9',
              background: 'var(--panel-2)',
            }}
          >
            <iframe
              title={`Map for ${dev!.rego}`}
              width="100%"
              height="100%"
              style={{ border: 0, display: 'block' }}
              loading="lazy"
              referrerPolicy="no-referrer"
              src={osmEmbed(dev!.lat!, dev!.lng!)}
            />
          </div>

          <div className="stack" style={{ gap: 8, marginTop: 12 }}>
            {dev!.address ? (
              <div className="row" style={{ gap: 8, alignItems: 'flex-start' }}>
                <MapPin size={15} style={{ marginTop: 2, color: 'var(--text-dim)' }} />
                <span style={{ fontSize: 13.5 }}>{dev!.address}</span>
              </div>
            ) : null}
            <div className="row" style={{ gap: 16, flexWrap: 'wrap' }}>
              <span className="row" style={{ gap: 6, fontSize: 13, color: 'var(--text-dim)' }}>
                <Clock size={14} /> {lastUpdate(dev!.time)}
              </span>
              {dev!.battery !== null ? (
                <span className="row" style={{ gap: 6, fontSize: 13, color: 'var(--text-dim)' }}>
                  <BatteryMedium size={14} /> Tag battery {dev!.battery}
                  {dev!.battery <= 100 ? '%' : ''}
                </span>
              ) : null}
              <a
                className="row"
                href={osmLink(dev!.lat!, dev!.lng!)}
                target="_blank"
                rel="noreferrer"
                style={{ gap: 6, fontSize: 13, color: 'var(--brand)', fontWeight: 600 }}
              >
                <ExternalLink size={14} /> Larger map
              </a>
            </div>
            <div className="faint" style={{ fontSize: 11.5 }}>
              Approximate — the tag only updates when a phone passes near the car.
            </div>
          </div>
        </>
      ) : (
        <div className="faint" style={{ padding: '18px 2px', fontSize: 13 }}>
          {res && !res.configured
            ? 'CityTag tracking isn’t connected for this workshop yet.'
            : 'No recent location for this car.'}
        </div>
      )}
    </div>
  );
}

function osmEmbed(lat: number, lng: number): string {
  const bbox = [lng - 0.006, lat - 0.004, lng + 0.006, lat + 0.004].join('%2C');
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat}%2C${lng}`;
}
function osmLink(lat: number, lng: number): string {
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=15/${lat}/${lng}`;
}
function lastUpdate(time: string | null): string {
  if (!time) return 'Last update unknown';
  const t = new Date(time).getTime();
  if (isNaN(t)) return String(time);
  const mins = Math.max(0, Math.round((Date.now() - t) / 60000));
  if (mins < 1) return 'Updated just now';
  if (mins < 60) return `Updated ${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `Updated ${hrs}h ago`;
  return `Updated ${new Date(time).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}`;
}
