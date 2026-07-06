'use client';
import Link from 'next/link';
import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { api, Board, BoardCard } from '@/lib/api';
import { ErrorBanner, Loading, PageHead, StatusBadge, useAsync } from '@/components/ui';

/** Pure: return a new board with `id` moved into `targetState` (and its stateName updated). */
function withCardMoved(board: Board, id: string, targetState: string): Board {
  let moved: BoardCard | undefined;
  const stripped = board.columns.map((col) => {
    const found = col.cards.find((c) => c.id === id);
    if (found) moved = { ...found, stateName: targetState };
    return { ...col, cards: col.cards.filter((c) => c.id !== id) };
  });
  if (!moved) return board;
  return {
    ...board,
    columns: stripped.map((col) =>
      col.state === targetState ? { ...col, cards: [...col.cards, moved!] } : col,
    ),
  };
}

export default function BoardPage() {
  const { data, loading, error, reload, setData } = useAsync(
    () => api.get<Board>('/board?type=job'),
    [],
  );
  const [moveError, setMoveError] = useState<string | null>(null);
  const [dragging, setDragging] = useState<{ id: string; from: string } | null>(null);

  // Optimistic move: the card jumps to the new column immediately; the API runs in the background and
  // we roll back to the previous board only if the server rejects the move (e.g. an illegal skip).
  async function moveCard(id: string, targetState: string) {
    if (!data) return;
    setMoveError(null);
    const previous = data;
    setData(withCardMoved(data, id, targetState));
    try {
      await api.post(`/board/cards/${id}/move`, { targetState });
    } catch (e) {
      setData(previous); // revert
      setMoveError(e instanceof Error ? e.message : String(e));
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
