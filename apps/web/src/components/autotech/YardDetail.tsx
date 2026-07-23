'use client';
import { useState } from 'react';
import { Car, ArrowRight } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { timeSince, Yard, YardDrop } from '@/lib/yards';
import { useAsync } from '@/components/ui';
import { AtTopbar } from '@/components/autotech/kit';

/**
 * The cars parked in one yard. Each row is a car currently sitting in the yard; "Move to workshop"
 * collects it — which flips the drop from `in_yard` to `collected`, so it immediately drops out of this
 * list and out of the yard's parked count. That is the automatic status update: the yard database always
 * reflects what is physically there.
 */
export function YardDetail({ yardId }: { yardId: string }) {
  const { data, loading, error, reload } = useAsync(
    () => Promise.all([api.get<Yard[]>('/yards'), api.get<YardDrop[]>('/yards/awaiting')]),
    [],
  );
  const yard = (data?.[0] ?? []).find((y) => y.id === yardId);
  const parked = (data?.[1] ?? []).filter((d) => d.yardId === yardId);

  const [busy, setBusy] = useState<string | null>(null);
  const [moveErr, setMoveErr] = useState<string | null>(null);

  async function moveToWorkshop(id: string) {
    setMoveErr(null);
    setBusy(id);
    try {
      await api.post(`/yards/drops/${id}/collect`);
      await reload();
    } catch (e) {
      setMoveErr(e instanceof ApiError ? e.message : 'Could not move the car');
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <AtTopbar backHref="/inout/yards" />
      <div className="at-h2">{yard?.name ?? 'Yard'}</div>

      {(error || moveErr) && (
        <div className="at-errbanner">{moveErr ?? 'Could not load the yard.'}</div>
      )}

      {loading ? (
        <div className="at-spin">Loading…</div>
      ) : parked.length === 0 ? (
        <div className="at-empty">No cars parked here right now.</div>
      ) : (
        <div className="at-list">
          {parked.map((d) => (
            <div key={d.id} className="at-lrow">
              <span className="ic">
                <Car size={22} strokeWidth={2} color="#fff" />
              </span>
              <div className="body">
                <div className="ti">{d.rego}</div>
                <div className="st">
                  {timeSince(d.droppedAt)}
                  {d.comments ? ` · ${d.comments}` : ''}
                </div>
              </div>
              <button
                type="button"
                className="at-rowbtn"
                disabled={busy === d.id}
                onClick={() => void moveToWorkshop(d.id)}
              >
                {busy === d.id ? '…' : 'To workshop'}
                {busy === d.id ? null : <ArrowRight size={15} strokeWidth={2.5} />}
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
