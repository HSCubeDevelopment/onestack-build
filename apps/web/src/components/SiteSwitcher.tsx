'use client';
import { useEffect, useState } from 'react';
import { Building2, ChevronDown } from 'lucide-react';
import { api, Site } from '@/lib/api';
import { ALL_SITES, useActiveSite } from '@/lib/active-site';

/**
 * Multi-workshop switcher (52.2). A header control that scopes the app — jobs, board, dashboard — to one
 * of the shop's locations, or "All workshops". Only shown to a shop that actually runs more than one
 * site; a single-workshop shop never sees it. Selecting a site broadcasts through `useActiveSite`, so
 * every page re-scopes without a reload.
 */
export function SiteSwitcher() {
  const [sites, setSites] = useState<Site[] | null>(null);
  const [active, setActive] = useActiveSite();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    api
      .get<Site[]>('/sites')
      .then((s) => alive && setSites(s))
      .catch(() => alive && setSites([]));
    return () => {
      alive = false;
    };
  }, []);

  // A single-site (or no-site) shop doesn't need a switcher.
  if (!sites || sites.length < 2) return null;

  const activeSite = sites.find((s) => s.id === active);
  const label = active === ALL_SITES ? 'All workshops' : (activeSite?.name ?? 'All workshops');

  const pick = (id: string) => {
    setActive(id);
    setOpen(false);
  };

  return (
    <div className="site-switcher" style={{ position: 'relative' }}>
      <button
        className="btn"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        style={{ gap: 8 }}
      >
        <Building2 size={15} />
        <span
          style={{
            maxWidth: 160,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {label}
        </span>
        <ChevronDown size={14} />
      </button>
      {open && (
        <>
          {/* click-away */}
          <div
            onClick={() => setOpen(false)}
            style={{ position: 'fixed', inset: 0, zIndex: 40 }}
            aria-hidden
          />
          <div
            role="listbox"
            className="card"
            style={{
              position: 'absolute',
              top: 'calc(100% + 6px)',
              left: 0,
              zIndex: 41,
              minWidth: 220,
              padding: 6,
              boxShadow: '0 10px 30px rgba(0,0,0,0.18)',
            }}
          >
            <SwitchRow
              label="All workshops"
              active={active === ALL_SITES}
              onClick={() => pick(ALL_SITES)}
            />
            {sites.map((s) => (
              <SwitchRow
                key={s.id}
                label={s.name}
                code={s.code}
                active={active === s.id}
                onClick={() => pick(s.id)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function SwitchRow({
  label,
  code,
  active,
  onClick,
}: {
  label: string;
  code?: string | null;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      role="option"
      aria-selected={active}
      onClick={onClick}
      className={`btn ${active ? 'primary' : ''}`}
      style={{ width: '100%', justifyContent: 'flex-start', gap: 8, marginBottom: 2 }}
    >
      <Building2 size={14} />
      <span>{label}</span>
      {code ? (
        <span className="badge" style={{ marginLeft: 'auto' }}>
          {code}
        </span>
      ) : null}
    </button>
  );
}
