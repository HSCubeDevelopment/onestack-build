'use client';

import { useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { ErrorBanner, Loading, PageHead, useAsync } from '@/components/ui';

/** Mirrors the API's FeatureView (composition/feature-admin.controller.ts). */
interface FeatureView {
  key: string;
  label: string;
  group: string;
  enabled: boolean;
  toggleable: boolean;
}

const GROUP_LABEL: Record<string, string> = {
  core: 'Core platform',
  automotive: 'Automotive pack',
};
const GROUP_SUB: Record<string, string> = {
  core: 'Shared by every tenant — always on.',
  automotive: 'Optional — switch on the features this business uses.',
};

/**
 * Feature admin (card #6.3) — an OWNER composes their own product by switching pack features on/off.
 *
 * The API is the gate: it's OWNER-only and tenant-scoped, and turning a feature off makes its routes 404
 * and its events silent. This page only drives those switches. Core features render locked (the API also
 * refuses to toggle them). Owners reach this page via the owner-only nav entry.
 */
export default function FeaturesPage() {
  const { data, loading, error, reload } = useAsync(() => api.get<FeatureView[]>('/admin/features'), []);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState('');

  const items = data ?? [];
  const groups = Array.from(new Set(items.map((f) => f.group)));

  const toggle = async (f: FeatureView) => {
    if (!f.toggleable || busy) return;
    setBusy(f.key);
    setMsg('');
    try {
      await api.patch(`/admin/features/${f.key}`, { enabled: !f.enabled });
      reload();
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : 'Could not update the feature. Please try again.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <PageHead title="Features" sub="Turn features on or off for this business" />
      <ErrorBanner message={error || msg} />

      {loading ? (
        <Loading />
      ) : (
        <div className="stack">
          {groups.map((g) => (
            <section key={g} className="card">
              <div style={{ marginBottom: 10 }}>
                <strong>{GROUP_LABEL[g] ?? g}</strong>
                <p className="muted" style={{ fontSize: 13, margin: '2px 0 0' }}>
                  {GROUP_SUB[g] ?? ''}
                </p>
              </div>

              {items
                .filter((f) => f.group === g)
                .map((f) => (
                  <div
                    key={f.key}
                    className="row"
                    style={{
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '10px 0',
                      borderTop: '1px solid var(--line, #e6e9ef)',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600 }}>{f.label}</div>
                      {!f.toggleable && (
                        <div className="muted" style={{ fontSize: 12 }}>
                          Core — always on
                        </div>
                      )}
                    </div>

                    {f.toggleable ? (
                      <button
                        type="button"
                        role="switch"
                        aria-checked={f.enabled}
                        aria-label={`${f.enabled ? 'Disable' : 'Enable'} ${f.label}`}
                        onClick={() => toggle(f)}
                        disabled={busy === f.key}
                        style={{
                          width: 46,
                          height: 28,
                          borderRadius: 20,
                          border: 'none',
                          cursor: busy === f.key ? 'default' : 'pointer',
                          background: f.enabled ? 'var(--primary, #2f6df0)' : '#d3d9e3',
                          position: 'relative',
                          transition: '.15s',
                          opacity: busy === f.key ? 0.6 : 1,
                          flexShrink: 0,
                        }}
                      >
                        <span
                          style={{
                            position: 'absolute',
                            top: 3,
                            left: f.enabled ? 21 : 3,
                            width: 22,
                            height: 22,
                            borderRadius: '50%',
                            background: '#fff',
                            boxShadow: '0 1px 2px rgba(0,0,0,.25)',
                            transition: '.15s',
                          }}
                        />
                      </button>
                    ) : (
                      <span
                        style={{ color: 'var(--success, #1c9668)', fontSize: 13, fontWeight: 600 }}
                        aria-hidden
                      >
                        ● On
                      </span>
                    )}
                  </div>
                ))}
            </section>
          ))}
        </div>
      )}
    </>
  );
}
