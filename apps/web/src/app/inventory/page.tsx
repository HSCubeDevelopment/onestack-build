'use client';
import { useState } from 'react';
import { api, InventoryItem } from '@/lib/api';
import { EmptyState, ErrorBanner, Loading, Modal, PageHead, useAsync } from '@/components/ui';

export default function InventoryPage() {
  const { data, loading, error, reload } = useAsync(
    () => api.get<InventoryItem[]>('/inventory'),
    [],
  );
  const [adding, setAdding] = useState(false);
  const [lowOnly, setLowOnly] = useState(false);
  const items = (data ?? []).filter((i) => (lowOnly ? i.lowStock : true));

  const adjust = async (item: InventoryItem, delta: number, reason: 'receive' | 'use') => {
    const n = Number(
      prompt(
        `${reason === 'receive' ? 'Receive' : 'Use'} how many ${item.unit ?? 'units'} of ${item.name}?`,
        '1',
      ),
    );
    if (!Number.isFinite(n) || n <= 0) return;
    await api.post(`/inventory/${item.id}/movement`, { delta: delta * Math.round(n), reason });
    reload();
  };
  const stocktake = async (item: InventoryItem) => {
    const n = Number(
      prompt(
        `Stocktake — counted ${item.unit ?? 'units'} of ${item.name} on hand:`,
        String(item.quantityOnHand),
      ),
    );
    if (!Number.isFinite(n) || n < 0) return;
    await api.post(`/inventory/${item.id}/stocktake`, { countedQuantity: Math.round(n) });
    reload();
  };

  const lowCount = (data ?? []).filter((i) => i.lowStock).length;

  return (
    <>
      <PageHead
        title="Inventory"
        sub={`Stock levels, usage and reordering${lowCount ? ` · ${lowCount} low` : ''}`}
      >
        <button className="btn primary" onClick={() => setAdding(true)}>
          + Add item
        </button>
      </PageHead>

      <ErrorBanner message={error} />

      <div className="card pad0">
        <div className="row" style={{ padding: '12px 18px', gap: 14 }}>
          <label className="row" style={{ gap: 6, alignItems: 'center', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={lowOnly}
              onChange={(e) => setLowOnly(e.target.checked)}
            />
            <span className="muted">Low stock only</span>
          </label>
        </div>
        <div className="divider" />
        {loading ? (
          <Loading />
        ) : items.length === 0 ? (
          <EmptyState>
            {lowOnly ? 'Nothing needs reordering. 🎉' : 'No inventory items yet.'}
          </EmptyState>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Item</th>
                <th>On hand</th>
                <th>Reorder at</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.id}>
                  <td>
                    {i.name} {i.sku ? <span className="muted">· {i.sku}</span> : null}
                  </td>
                  <td>
                    <strong style={{ color: i.lowStock ? 'var(--danger, #be4152)' : undefined }}>
                      {i.quantityOnHand}
                    </strong>{' '}
                    <span className="muted">{i.unit ?? ''}</span>
                    {i.lowStock ? <span className="muted"> · low</span> : null}
                  </td>
                  <td className="muted">
                    {i.reorderLevel}
                    {i.parLevel ? ` · par ${i.parLevel}` : ''}
                    {i.lowStock && i.suggestedReorderQty > 0 ? (
                      <span style={{ color: 'var(--warning, #b37d28)' }}>
                        {' '}
                        · reorder {i.suggestedReorderQty}
                      </span>
                    ) : null}
                  </td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button className="btn" onClick={() => adjust(i, 1, 'receive')}>
                      Receive
                    </button>{' '}
                    <button className="btn" onClick={() => adjust(i, -1, 'use')}>
                      Use
                    </button>{' '}
                    <button className="btn" onClick={() => stocktake(i)}>
                      Count
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {adding ? (
        <AddModal
          onClose={() => setAdding(false)}
          onDone={() => {
            setAdding(false);
            reload();
          }}
        />
      ) : null}
    </>
  );
}

function AddModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState('');
  const [unit, setUnit] = useState('');
  const [quantityOnHand, setQty] = useState('0');
  const [reorderLevel, setReorder] = useState('0');
  const [parLevel, setPar] = useState('0');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.post('/inventory', {
        name,
        unit: unit || undefined,
        quantityOnHand: parseInt(quantityOnHand, 10) || 0,
        reorderLevel: parseInt(reorderLevel, 10) || 0,
        parLevel: parseInt(parLevel, 10) || 0,
      });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <Modal title="Add inventory item" onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <input
          className="input"
          placeholder="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          className="input"
          placeholder="Unit (e.g. each, litre)"
          value={unit}
          onChange={(e) => setUnit(e.target.value)}
        />
        <div className="row" style={{ gap: 10 }}>
          <input
            className="input"
            type="number"
            placeholder="On hand"
            value={quantityOnHand}
            onChange={(e) => setQty(e.target.value)}
          />
          <input
            className="input"
            type="number"
            placeholder="Reorder at"
            value={reorderLevel}
            onChange={(e) => setReorder(e.target.value)}
          />
          <input
            className="input"
            type="number"
            placeholder="Par (target)"
            value={parLevel}
            onChange={(e) => setPar(e.target.value)}
          />
        </div>
        <ErrorBanner message={error} />
        <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={save} disabled={busy || !name.trim()}>
            {busy ? 'Saving…' : 'Add'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
