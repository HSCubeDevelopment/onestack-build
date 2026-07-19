import { describe, expect, it } from 'vitest';
import { EMBEDDING_DIMS, normalise, toVectorLiteral } from './embedder';
import { StubEmbedder } from './stub-embedder';

describe('embedder helpers', () => {
  it('normalise scales a vector to unit length', () => {
    const unit = normalise([3, 4]); // 3-4-5 triangle
    expect(unit).toEqual([0.6, 0.8]);
  });

  it('normalise leaves an all-zero vector alone rather than dividing by zero', () => {
    expect(normalise([0, 0, 0])).toEqual([0, 0, 0]);
  });

  it('toVectorLiteral renders the form pgvector parses', () => {
    expect(toVectorLiteral(new Array(EMBEDDING_DIMS).fill(0))).toMatch(/^\[0(,0){1023}\]$/);
  });

  it('toVectorLiteral refuses a wrong-width vector', () => {
    // Storing a short vector would fail deep in Postgres; catching it here names the real problem.
    expect(() => toVectorLiteral([1, 2, 3])).toThrow(/1024 dims, got 3/);
  });
});

describe('StubEmbedder', () => {
  const embedder = new StubEmbedder();

  it('returns one unit-length vector of the right width per input', async () => {
    const [vector] = await embedder.embed([{ kind: 'scope', text: 'front bumper replace' }]);
    expect(vector).toHaveLength(EMBEDDING_DIMS);

    const magnitude = Math.sqrt(vector!.reduce((sum, v) => sum + v * v, 0));
    expect(magnitude).toBeCloseTo(1, 10);
  });

  it('is deterministic — the same content always embeds identically', async () => {
    const [a] = await embedder.embed([{ kind: 'scope', text: 'front bumper replace' }]);
    const [b] = await embedder.embed([{ kind: 'scope', text: 'front bumper replace' }]);
    expect(a).toEqual(b);
  });

  it('separates different content', async () => {
    const [a] = await embedder.embed([{ kind: 'scope', text: 'front bumper replace' }]);
    const [b] = await embedder.embed([{ kind: 'scope', text: 'rear door repaint' }]);

    // Unit vectors, so the dot product IS the cosine similarity. The stub carries no semantics; all it
    // must guarantee is that unrelated content doesn't collide into the same direction.
    const cosine = a!.reduce((sum, v, i) => sum + v * b![i]!, 0);
    expect(Math.abs(cosine)).toBeLessThan(0.5);
  });

  it('distinguishes a photo from text with identical bytes', async () => {
    // The kind is part of the hash, so a caption and a base64 blob that happen to match don't collide.
    const [asText] = await embedder.embed([{ kind: 'scope', text: 'AAAA' }]);
    const [asPhoto] = await embedder.embed([
      { kind: 'photo', contentType: 'image/jpeg', dataBase64: 'AAAA' },
    ]);
    expect(asText).not.toEqual(asPhoto);
  });

  it('preserves input order across a batch', async () => {
    const inputs = ['a', 'b', 'c'].map((text) => ({ kind: 'scope' as const, text }));
    const batch = await embedder.embed(inputs);
    const individually = await Promise.all(inputs.map(async (i) => (await embedder.embed([i]))[0]));

    // Order matters: the service pairs vectors back to pieces positionally, so a provider that
    // reordered results would silently attach every vector to the wrong job.
    expect(batch).toEqual(individually);
  });
});
