'use client';
import Link from 'next/link';
import { CheckCircle2 } from 'lucide-react';
import { QUICK_FLOWS } from '@/lib/inout';
import { PageHead } from '@/components/ui';

const TINT: Record<string, [string, string]> = {
  brand: ['var(--brand-soft)', 'var(--brand)'],
  green: ['var(--green-soft)', 'var(--green)'],
  red: ['var(--red-soft)', 'var(--red)'],
  amber: ['var(--amber-soft)', 'var(--amber)'],
  blue: ['var(--blue-soft)', 'var(--blue)'],
};

/** Quick add — the six In N Out flows as a page (opened by the ＋ tab). */
export default function QuickAddPage() {
  return (
    <>
      <PageHead title="Quick add" sub="What's happening with the car?" />
      <div className="stack" style={{ gap: 8 }}>
        {QUICK_FLOWS.map((f) => {
          const [bg, fg] = TINT[f.tone];
          return (
            <Link
              key={f.key}
              href={f.href}
              className="job-row"
              style={{ textDecoration: 'none', color: 'inherit' }}
            >
              <div className="job-row-main">
                <span className="list-ico" style={{ background: bg, color: fg }}>
                  <CheckCircle2 size={16} />
                </span>
                <div style={{ minWidth: 0 }}>
                  <b style={{ fontSize: 14 }}>{f.title}</b>
                  <div className="job-cust">{f.sub}</div>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </>
  );
}
