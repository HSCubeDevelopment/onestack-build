'use client';
import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';

/** Tiny data-loading hook: runs an async fn, exposes { data, loading, error, reload }. */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await fn());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => {
    void run();
  }, [run]);
  return { data, loading, error, reload: run, setData };
}

export function Loading() {
  return <div className="loading">Loading…</div>;
}

export function ErrorBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="err" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <AlertTriangle size={15} /> {message}
    </div>
  );
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return <div className="empty">{children}</div>;
}

export function Modal({
  title,
  onClose,
  children,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  return (
    <div className="overlay" onClick={onClose}>
      <div className={`modal ${wide ? 'modal-wide' : ''}`} onClick={(e) => e.stopPropagation()}>
        <div className="row" style={{ marginBottom: 16 }}>
          <h2 style={{ margin: 0 }}>{title}</h2>
          <div className="spacer" />
          <button className="btn ghost sm" onClick={onClose}>
            <X size={15} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

const STATUS_COLORS: Record<string, string> = {
  // quote
  Draft: '',
  Sent: 'blue',
  Accepted: 'green',
  Declined: 'red',
  // invoice
  Unpaid: 'amber',
  Paid: 'green',
  PartiallyPaid: 'blue',
  Overpaid: 'purple',
  Void: '',
  // lead
  New: 'blue',
  Contacted: 'amber',
  Converted: 'green',
  // job states
  Booked: 'blue',
  InProgress: 'amber',
  AwaitingParts: 'purple',
  Ready: 'green',
  Collected: '',
};

export function StatusBadge({ status }: { status: string }) {
  const color = STATUS_COLORS[status] ?? '';
  return <span className={`badge ${color}`}>{humanize(status)}</span>;
}

export function humanize(s: string): string {
  return s.replace(/([a-z])([A-Z])/g, '$1 $2');
}

export function PageHead({
  title,
  sub,
  children,
}: {
  title: string;
  sub?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        {sub && <div className="sub">{sub}</div>}
      </div>
      <div className="row wrap">{children}</div>
    </div>
  );
}
