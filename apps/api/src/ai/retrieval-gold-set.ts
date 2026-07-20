/**
 * Card 60.6 — the gold set: past jobs to index, and questions whose right answers we know.
 *
 * Hand-written rather than sampled from a real shop, deliberately: a real dataset is customer PII and
 * indexing it is card 60.1 (OFF-LIMITS, human-owned). This set is synthetic panel-and-paint work chosen
 * so the RIGHT answer is defensible to a human reader — a front-end collision should retrieve other
 * front-end collisions, not a hail claim.
 *
 * It is a floor, not a benchmark. It measures whether an embedder understands that "front bumper
 * replace + bonnet repair" is closer to "front bumper replace + bonnet blend" than to "hail dents across
 * roof". An embedder that fails THIS is unusable; passing it is necessary, not sufficient. Replace it
 * with sampled real jobs once 60.1 lands and consent is settled.
 */

export interface GoldJob {
  id: string;
  summary: string;
}

export interface GoldQuery {
  name: string;
  /** The new job's scope text, as an estimator would describe it. */
  summary: string;
  /** Ids from GOLD_JOBS a correct system returns. Empty = should return nothing. */
  expectedJobIds: string[];
}

/** Past jobs to index before running the queries. */
export const GOLD_JOBS: GoldJob[] = [
  {
    id: 'front-1',
    summary: 'Front bumper replace, bonnet repair and refinish, left headlight replace',
  },
  {
    id: 'front-2',
    summary: 'Front bumper bar replace, bonnet blend, right headlight housing replace',
  },
  { id: 'front-3', summary: 'Front end collision: bumper, bonnet, both guards, grille replace' },
  { id: 'rear-1', summary: 'Rear bumper replace, tailgate repair, tow bar refit' },
  { id: 'rear-2', summary: 'Rear bumper bar replace and repaint, boot lid dent repair' },
  { id: 'door-1', summary: 'Left front door skin replace, left rear door blend' },
  { id: 'door-2', summary: 'Right rear door dent repair and refinish, right guard blend' },
  {
    id: 'hail-1',
    summary: 'Hail damage: paintless dent repair across roof, bonnet and both guards',
  },
  { id: 'hail-2', summary: 'Hail claim, PDR roof and boot lid, no paint required' },
  { id: 'glass-1', summary: 'Windscreen replace, no panel damage' },
];

/**
 * Questions. Each is a new job's scope; the expected ids are the past jobs a competent estimator would
 * say are the relevant precedents.
 */
export const GOLD_QUERIES: GoldQuery[] = [
  {
    name: 'front-end collision finds other front-end jobs',
    summary: 'Front bumper replace, bonnet repair, headlight replace',
    expectedJobIds: ['front-1', 'front-2', 'front-3'],
  },
  {
    name: 'rear damage finds rear jobs, not front',
    summary: 'Rear bumper replace, boot lid repair',
    expectedJobIds: ['rear-1', 'rear-2'],
  },
  {
    name: 'hail finds hail, which is a different KIND of job',
    // The discriminating case: hail is many small dents with no panel replacement. An embedder keying
    // on "panel words" rather than the nature of the work will drag in collision jobs here.
    summary: 'Hail damage across roof and guards, paintless dent repair',
    expectedJobIds: ['hail-1', 'hail-2'],
  },
  {
    name: 'door damage finds door jobs',
    summary: 'Left front door skin replace and blend adjacent panel',
    expectedJobIds: ['door-1', 'door-2'],
  },
  {
    name: 'glass-only finds the glass job',
    summary: 'Windscreen replacement only, no bodywork',
    expectedJobIds: ['glass-1'],
  },
  {
    name: 'unrelated work returns nothing rather than a bad guess',
    // Nothing in the set resembles this. Returning a confident wrong precedent is worse than returning
    // none, because a human reads a precedent as evidence the shop has done this before.
    summary: 'Full vehicle vinyl wrap, matte black, no repair work',
    expectedJobIds: [],
  },
];
