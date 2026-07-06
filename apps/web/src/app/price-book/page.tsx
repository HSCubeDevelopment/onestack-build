'use client';
import { useState } from 'react';
import { api, PriceBookItem, money } from '@/lib/api';
import {
  EmptyState,
  ErrorBanner,
  Loading,
  Modal,
  PageHead,
  useAsync,
} from '@/components/ui';

export default function PriceBookPage() {
  const [q, setQ] = useState('');
  const [activeOnly, setActiveOnly] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<PriceBookItem | null>(null);

  const { data, loading, error, reload } = useAsync<PriceBookItem[]>(() => {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (activeOnly) params.set('activeOnly', 'true');
    const qs = params.toString();
    return api.get<PriceBookItem[]>(`/price-book${qs ? `?${qs}` : ''}`);
  }, [q, activeOnly]);

  async function deactivate(item: PriceBookItem) {
    await api.post<PriceBookItem>(`/price-book/${item.id}/deactivate`);
    reload();
  }

  return (
    <>
      <PageHead title="Price book" sub="Labour rates and parts you quote from">
        <button className="btn primary" onClick={() => setCreating(true)}>
          + New item
        </button>
      </PageHead>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="row wrap">
          <input
            className="input"
            style={{ maxWidth: 320 }}
            placeholder="Search name or code…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <label className="row" style={{ gap: 6, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={activeOnly}
              onChange={(e) => setActiveOnly(e.target.checked)}
            />
            <span className="muted">Active only</span>
          </label>
        </div>
      </div>

      <ErrorBanner message={error} />
      {loading && <Loading />}

      {data && data.length === 0 && (
        <EmptyState>No items yet. Create your first price book item.</EmptyState>
      )}

      {data && data.length > 0 && (
        <div className="card pad0">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Code</th>
                <th>Type</th>
                <th>Unit</th>
                <th className="right">Default price</th>
                <th>Active</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {data.map((item) => (
                <tr key={item.id}>
                  <td>
                    <strong>{item.name}</strong>
                    {item.description && (
                      <div className="faint" style={{ fontSize: 12 }}>
                        {item.description}
                      </div>
                    )}
                  </td>
                  <td className="mono">{item.code ?? '—'}</td>
                  <td>
                    <span className={`badge ${item.type === 'labour' ? 'blue' : 'purple'}`}>
                      {item.type}
                    </span>
                  </td>
                  <td className="muted">{item.unit}</td>
                  <td className="right">{money(item.defaultUnitPriceCents)}</td>
                  <td>
                    <span className={`badge ${item.active ? 'green' : ''}`}>
                      {item.active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="right nowrap">
                    <button className="btn ghost sm" onClick={() => setEditing(item)}>
                      Edit
                    </button>
                    {item.active && (
                      <button className="btn danger sm" onClick={() => deactivate(item)}>
                        Deactivate
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {creating && (
        <ItemModal
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            reload();
          }}
        />
      )}
      {editing && (
        <ItemModal
          item={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            reload();
          }}
        />
      )}
    </>
  );
}

function ItemModal({
  item,
  onClose,
  onSaved,
}: {
  item?: PriceBookItem;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(item?.name ?? '');
  const [type, setType] = useState(item?.type ?? 'labour');
  const [unit, setUnit] = useState(item?.unit ?? 'hour');
  const [price, setPrice] = useState(
    item ? (item.defaultUnitPriceCents / 100).toString() : '',
  );
  const [code, setCode] = useState(item?.code ?? '');
  const [description, setDescription] = useState(item?.description ?? '');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [dupWarning, setDupWarning] = useState(false);

  async function save() {
    setSaving(true);
    setErr(null);
    try {
      const cents = Math.round(parseFloat(price) * 100);
      if (isNaN(cents)) throw new Error('Enter a valid price');
      if (item) {
        await api.patch<PriceBookItem>(`/price-book/${item.id}`, {
          name,
          type,
          unit,
          defaultUnitPriceCents: cents,
          code: code || undefined,
          description: description || undefined,
        });
        onSaved();
      } else {
        const res = await api.post<{ item: PriceBookItem; duplicateNameWarning: boolean }>(
          '/price-book',
          {
            name,
            type,
            unit,
            defaultUnitPriceCents: cents,
            code: code || undefined,
            description: description || undefined,
          },
        );
        if (res.duplicateNameWarning) {
          setDupWarning(true);
          setSaving(false);
          return;
        }
        onSaved();
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  }

  return (
    <Modal title={item ? 'Edit item' : 'New item'} onClose={onClose}>
      <div className="stack" style={{ gap: 12 }}>
        <ErrorBanner message={err} />
        {dupWarning && (
          <div className="badge amber" style={{ alignSelf: 'flex-start' }}>
            Another active item shares this name
          </div>
        )}
        <label className="field">
          Name
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <div className="grid cols-2">
          <label className="field">
            Type
            <select className="select" value={type} onChange={(e) => setType(e.target.value)}>
              <option value="labour">Labour</option>
              <option value="part">Part</option>
            </select>
          </label>
          <label className="field">
            Unit
            <select className="select" value={unit} onChange={(e) => setUnit(e.target.value)}>
              <option value="hour">Hour</option>
              <option value="each">Each</option>
            </select>
          </label>
        </div>
        <div className="grid cols-2">
          <label className="field">
            Default price (AUD)
            <input
              className="input"
              type="number"
              step="0.01"
              min="0"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
          </label>
          <label className="field">
            Code (optional)
            <input className="input" value={code} onChange={(e) => setCode(e.target.value)} />
          </label>
        </div>
        <label className="field">
          Description (optional)
          <textarea
            className="input"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
        <div className="row">
          <div className="spacer" />
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={save} disabled={saving || !name}>
            {saving ? 'Saving…' : item ? 'Save changes' : 'Create item'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
