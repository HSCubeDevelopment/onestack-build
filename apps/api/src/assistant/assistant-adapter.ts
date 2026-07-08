/**
 * The AI gateway contract for the assistant (Phase 3). Provider-abstracted: real Anthropic Claude when a
 * key is configured, a deterministic stub otherwise — so the assistant works with NO external API in the
 * MVP. Whatever it returns is an EDITABLE DRAFT a human confirms before sending; nothing auto-sends.
 */

export interface AssistantInput {
  question: string;
  /** Optional context (e.g. a job reference / customer name) to ground the draft. */
  context?: string;
}

export interface AssistantAnswer {
  answer: string;
  /** Which model/adapter produced it, for audit. */
  model: string;
}

export interface AssistantAdapter {
  readonly name: string;
  answer(input: AssistantInput): Promise<AssistantAnswer>;
}

/** DI token for the configured adapter (Anthropic when a key is set, stub otherwise). */
export const ASSISTANT_ADAPTER = Symbol('ASSISTANT_ADAPTER');

/** Cap the question length handed to the model (cost + abuse guard). */
export const MAX_QUESTION_CHARS = 2000;
