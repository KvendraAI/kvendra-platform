/* SPDX-License-Identifier: AGPL-3.0-only */
import type { EmbeddingsProvider } from './provider.js';
import { MockEmbeddingsProvider } from './mock-provider.js';

export type { EmbeddingsProvider, EmbeddingsRequest, EmbeddingsResponse } from './provider.js';
export { KVENDRA_EMBEDDING_MODEL, EMBEDDING_DIM, approxTokenCount, l2Normalize } from './provider.js';
export { MockEmbeddingsProvider };

/**
 * Resolve the embeddings provider per `EMBEDDINGS_PROVIDER` env var.
 * M1 only ships the `mock` provider — other values throw with a clear error
 * (deferred to M2 per ROAD-KVD-011).
 */
export function resolveEmbeddingsProvider(kind: string): EmbeddingsProvider {
  switch (kind) {
    case 'mock':
      return new MockEmbeddingsProvider();
    case 'bedrock':
    case 'openai':
    case 'ollama':
    case 'http':
      throw new Error(
        `Embeddings provider "${kind}" is not implemented in M1. Set EMBEDDINGS_PROVIDER=mock (M2 will add BYOK providers per ROAD-KVD-011).`,
      );
    default:
      throw new Error(`Unknown EMBEDDINGS_PROVIDER "${kind}".`);
  }
}
