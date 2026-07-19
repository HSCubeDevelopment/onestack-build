import { createHash } from 'node:crypto';
import { EMBEDDING_DIMS, EmbedInput, Embedder, normalise } from './embedder';

/**
 * Deterministic fallback embedder (no external API). Runs when no embedding key is configured — local
 * dev, CI, and tests. It does NOT understand content; it hashes the input into a stable pseudo-random
 * direction, so the rest of the retrieval flow (index, similarity search, grounded drafting) can be
 * built and tested end-to-end without a vendor.
 *
 * The one property that makes it useful rather than pure noise: **identical content always yields an
 * identical vector, and different content yields a near-orthogonal one**. That's enough to prove
 * plumbing — a job matches its own re-embedding, and doesn't match an unrelated one — but it carries no
 * semantic signal, so a stub-backed index cannot rank *similar* jobs. Retrieval quality is only
 * meaningful against a real provider; card 60.6's eval set is what measures it.
 */
export class StubEmbedder implements Embedder {
  readonly name = 'stub';

  async embed(inputs: EmbedInput[]): Promise<number[][]> {
    return inputs.map((input) => this.vectorFor(input));
  }

  private vectorFor(input: EmbedInput): number[] {
    const content = input.kind === 'photo' ? input.dataBase64 : input.text;
    // Seed from the content hash so the same bytes always land in the same direction.
    const seed = createHash('sha256').update(`${input.kind}:${content}`).digest();

    const vector = new Array<number>(EMBEDDING_DIMS);
    for (let i = 0; i < EMBEDDING_DIMS; i++) {
      // Walk the 32-byte digest cyclically, mixing in the position so the vector doesn't repeat
      // every 32 slots — that repetition would make unrelated inputs share structure and score alike.
      const byte = seed[i % seed.length] ?? 0;
      vector[i] = Math.sin((byte + 1) * (i + 1) * 0.017);
    }
    return normalise(vector);
  }
}
