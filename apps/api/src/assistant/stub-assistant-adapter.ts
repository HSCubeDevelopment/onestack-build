import { AssistantAdapter, AssistantAnswer, AssistantInput } from './assistant-adapter';

/**
 * Deterministic fallback assistant (no external API). Runs when ANTHROPIC_API_KEY is unset — local dev,
 * CI, and tests. It does NOT reason; it produces a safe, generic DRAFT reply that acknowledges the
 * question and defers to a human, so the flow works end-to-end without a vendor. Same input → same draft.
 */
export class StubAssistantAdapter implements AssistantAdapter {
  readonly name = 'stub';

  async answer(input: AssistantInput): Promise<AssistantAnswer> {
    const q = input.question.trim();
    const ctx = input.context ? ` (re: ${input.context})` : '';
    const answer =
      `Thanks for getting in touch${ctx}. Regarding "${q}" — a team member will confirm the details ` +
      `and get back to you shortly. Is there anything else we can help with?`;
    return { answer, model: 'stub' };
  }
}
