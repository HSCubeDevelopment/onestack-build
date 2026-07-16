import Anthropic from '@anthropic-ai/sdk';
import { AssistantAdapter, AssistantAnswer, AssistantInput } from './assistant-adapter';

const SYSTEM = [
  'You are a helpful front-desk assistant for an Australian auto-repair / panel-beating shop. A customer',
  'has asked a question. Draft a concise, friendly reply (2-4 sentences) that a staff member will REVIEW',
  'before sending — so never promise prices, dates, or outcomes you cannot be sure of; when unsure, say a',
  'team member will confirm. Do not invent details. Australian English.',
].join(' ');

/**
 * Real AI adapter — Anthropic Claude (Phase 3). Used only when ANTHROPIC_API_KEY is set; otherwise the
 * deterministic stub runs. Drafts a customer reply a staff member reviews before sending (never auto-sent).
 * Model defaults to claude-opus-4-8, overridable with AI_ASSISTANT_MODEL. Output is capped (max_tokens).
 */
export class AnthropicAssistantAdapter implements AssistantAdapter {
  readonly name: string;
  private readonly client: Anthropic;

  constructor(apiKey: string, model = process.env.AI_ASSISTANT_MODEL || 'claude-opus-4-8') {
    this.client = new Anthropic({ apiKey });
    this.name = model;
  }

  async answer(input: AssistantInput): Promise<AssistantAnswer> {
    const content =
      (input.context ? `Context: ${input.context}\n\n` : '') + `Question: ${input.question}`;
    const response = await this.client.messages.create({
      model: this.name,
      max_tokens: 1024,
      system: SYSTEM,
      messages: [{ role: 'user', content }],
    });
    if (response.stop_reason === 'refusal') {
      throw new Error('AI declined to answer that question');
    }
    const answer = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();
    if (!answer) throw new Error('AI returned an empty answer');
    return { answer, model: this.name };
  }
}
