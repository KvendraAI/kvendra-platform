/* SPDX-License-Identifier: AGPL-3.0-only */
import { describe, expect, it } from 'vitest';

import { EMBEDDING_DIM, MockEmbeddingsProvider } from '../../src/embeddings/index.js';

describe('MockEmbeddingsProvider', () => {
  const provider = new MockEmbeddingsProvider();

  it('returns 1024-dim vectors', async () => {
    const { data } = await provider.embed({ input: 'hello kvendra' });
    expect(data).toHaveLength(1);
    expect(data[0]?.embedding).toHaveLength(EMBEDDING_DIM);
  });

  it('is deterministic for the same input', async () => {
    const a = await provider.embed({ input: 'same' });
    const b = await provider.embed({ input: 'same' });
    expect(a.data[0]?.embedding).toEqual(b.data[0]?.embedding);
  });

  it('returns L2-normalized vectors (norm ≈ 1)', async () => {
    const { data } = await provider.embed({ input: 'kvendra platform' });
    const vec = data[0]?.embedding ?? [];
    let sumsq = 0;
    for (const v of vec) sumsq += v * v;
    expect(Math.abs(Math.sqrt(sumsq) - 1)).toBeLessThan(1e-6);
  });

  it('handles batch inputs', async () => {
    const { data } = await provider.embed({ input: ['a', 'b', 'c'] });
    expect(data).toHaveLength(3);
    expect(data.map((d) => d.index)).toEqual([0, 1, 2]);
  });
});
