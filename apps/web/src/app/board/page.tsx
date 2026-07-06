'use client';
import Link from 'next/link';
import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { api, Board, BoardCard } from '@/lib/api';
import { ErrorBanner, Loading, PageHead, StatusBadge, useAsync } from '@/components/ui';

export default function BoardPage() {
  const { data, loading, error, reload } = useAsync(() => api.get<Board>('/board?type=job'), []);
  const [moveError, setMoveError] = useState<string | null>(null);
  const [dragging, setDragging] = useState<{ id: string; from: string } | null>(null);

  async function moveCard(id: string, targetState: string) {
    setMoveError(null);
    try {
      await api.post(`/board/cards/${id}/move`, { targetState });
    } catch (e) {
      setMoveError(e instanceof Error ? e.message : String(e));
    } finally {
      // Reload either way — never move optimistically without confirming.
      await reload();
    }
  }

  return (
    <>
      <PageHead title="Job board" sub="Drag a job to move it through the workshop">
        <button className="btn sm" onClick={() => reload()}>
          <RefreshCw size={14} /> Refresh
        </button>
      </PageHead>
      <ErrorBanner message={error} />
      <ErrorBanner message={moveError} />
      {loading && <Loading />}
      {data && (
        <div className="board">
          {data.columns.map((col) => (
            <Column
              key={col.state}
              state={col.state}
              cards={col.cards}
              dragging={dragging}
              onDragStart={(card) => setDragging({ id: card.id, from: card.stateName })}
              onDragEnd={() => setDragging(null)}
              onDropCard={(id) => {
                if (dragging && dragging.from !== col.state) moveCard(id, col.state);
              }}
            />
          ))}
        </div>
      )}
    </>
  );
}

function Column({
  state,
  cards,
  dragging,
  onDragStart,
  onDragEnd,
  onDropCard,
}: {
  state: string;
  cards: BoardCard[];
  dragging: { id: string; from: string } | null;
  onDragStart: (card: BoardCard) => void;
  onDragEnd: () => void;
  onDropCard: (id: string) => void;
}) {
  const [over, setOver] = useState(false);
  const isTarget = dragging !== null && dragging.from !== state;

  return (
    <div
      className={`column ${over && isTarget ? 'drop-target' : ''}`}
      onDragOver={(e) => {
        if (!isTarget) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const id = e.dataTransfer.getData('text/plain');
        if (id) onDropCard(id);
      }}
    >
      <div className="column-head">
        <StatusBadge status={state} />
        <span className="faint">{cards.length}</span>
      </div>
      <div className="column-body">
        {cards.length === 0 && <span className="faint">Nothing here yet</span>}
        {cards.map((card) => (
          <Card
            key={card.id}
            card={card}
            isDragging={dragging?.id === card.id}
            onDragStart={(e) => {
              e.dataTransfer.setData('text/plain', card.id);
              e.dataTransfer.effectAllowed = 'move';
              onDragStart(card);
            }}
            onDragEnd={onDragEnd}
          />
        ))}
      </div>
    </div>
  );
}

function Card({
  card,
  isDragging,
  onDragStart,
  onDragEnd,
}: {
  card: BoardCard;
  isDragging: boolean;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
}) {
  return (
    <Link
      href={`/jobs/${card.id}`}
      className={`job-card ${isDragging ? 'dragging' : ''}`}
      style={{ display: 'block' }}
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      <div className="ref">{card.reference}</div>
      <div style={{ fontSize: 12 }}>{card.customerName ?? '—'}</div>
      {card.vehicleLabel && (
        <div className="faint" style={{ fontSize: 11 }}>
          {card.vehicleLabel}
        </div>
      )}
      {card.assignees.length > 0 && (
        <div className="faint" style={{ fontSize: 11, marginTop: 4 }}>
          {card.assignees.length} assigned
        </div>
      )}
    </Link>
  );
}
