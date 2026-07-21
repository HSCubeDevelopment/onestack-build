'use client';

import Link from 'next/link';
import { AlertTriangle, ArrowRight, Camera, Clock } from 'lucide-react';
import type { BoardCard, PipelineView } from '@/lib/api';
import { humanizeState, regoOfCard, stageTint } from '@/lib/job-display';

/**
 * The owner home, matched to the prototype's `homeOwner()`.
 *
 * Three pieces the old dashboard didn't have, and each earns its place:
 *   Hero      — the one-line answer to "how's today?", before any drilling.
 *   Pipeline  — every workflow stage with a count, so the shape of the day is visible at a glance.
 *               Fed by the real /pipeline endpoint from card 52.3; stages come from the pack, so
 *               nothing here hard-codes automotive stage names.
 *   Board     — today's jobs as rego plates and status pills, which is how a panel shop identifies
 *               a car. A plate is a recognisable object; a job number is not.
 *
 * DELIBERATELY ABSENT: the prototype also shows "your workshops", "awaiting in yards" and an alerts
 * feed. Locations (6.15), yards (6.16) and an alerts source do not exist yet, and inventing them
 * with placeholder numbers would put figures on an owner's home screen that mean nothing. They go in
 * when their cards land.
 */

export function Hero({ name, carsInShop }: { name: string; carsInShop: number }) {
  return (
    <div className="hero">
      <div className="hero-glow" aria-hidden />
      <div className="hero-text">
        <div className="hero-kicker">GOOD MORNING, {name.toUpperCase()}</div>
        <h2>
          {carsInShop} {carsInShop === 1 ? 'car' : 'cars'} in the shop today
        </h2>
      </div>
    </div>
  );
}

/**
 * The car lifecycle. Every stage the workflow declares, including empty ones — "nothing in paint
 * today" is information, and dropping empties would make the strip change shape as work moves.
 */
export function PipelineStrip({ pipeline }: { pipeline: PipelineView }) {
  return (
    <section className="card">
      <div className="lbl2">CAR LIFECYCLE</div>
      <div className="pipeline" data-scroll-x>
        {pipeline.stages.map((stage) => (
          <Link key={stage.name} href={`/board`} className="pipeline-stage">
            <div className="pipeline-count" style={{ color: stageTint(stage.name) }}>
              {stage.count}
            </div>
            <div className="pipeline-label">{stage.name}</div>
          </Link>
        ))}
      </div>
      {pipeline.stuck.length > 0 && (
        <div className="pipeline-stuck">
          <AlertTriangle size={14} aria-hidden />
          <span>
            {pipeline.stuck.length} {pipeline.stuck.length === 1 ? 'job needs' : 'jobs need'} a look
            — {pipeline.stuck[0]?.stuckReason?.toLowerCase()}
          </span>
        </div>
      )}
    </section>
  );
}

export function TodaysBoard({ board }: { board: BoardCard[] }) {
  const open = board.filter((j) => !/collected|cancelled/i.test(j.stateName)).slice(0, 5);

  return (
    <section className="card">
      <div className="board-head">
        <b>Today’s board</b>
        <Link href="/board" className="see-all">
          See all <ArrowRight size={14} aria-hidden />
        </Link>
      </div>

      {open.length === 0 ? (
        <p className="faint">Nothing on the floor right now.</p>
      ) : (
        open.map((card) => {
          const rego = regoOfCard(card);
          return (
            <Link key={card.id} href={`/jobs/${card.id}`} className="job-row">
              <div className="job-row-main">
                <span className="job-ref">{card.reference}</span>
                {rego && <span className="rego-plate">{rego}</span>}
                {card.customerName && <span className="job-cust">{card.customerName}</span>}
              </div>
              <span className="status-pill" style={{ background: stageTint(card.stateName) }}>
                {humanizeState(card.stateName)}
              </span>
            </Link>
          );
        })
      )}
    </section>
  );
}

/** The prototype's quick actions. Only routes that exist — a dead tile is worse than no tile. */
export function QuickActions() {
  return (
    <div className="quick-actions">
      <Link href="/time-clock" className="btn dark">
        <Clock size={15} aria-hidden /> Time clock
      </Link>
      <Link href="/board" className="btn dark">
        <Camera size={15} aria-hidden /> Job board
      </Link>
    </div>
  );
}
