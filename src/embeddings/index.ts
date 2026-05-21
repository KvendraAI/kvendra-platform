/* SPDX-License-Identifier: AGPL-3.0-only */
import type { EmbeddingsProvider } from './provider.js';
import { MockEmbeddingsProvider } from './mock-provider.js';
import { OpenAICompatibleEmbeddingsProvider } from './openai-compatible-provider.js';

export type {
  EmbeddingsProvider,
  EmbeddingsRequest,
  EmbeddingsResponse,
} from './provider.js';
export {
  KVENDRA_EMBEDDING_MODEL,
  EMBEDDING_DIM,
  approxTokenCount,
  l2Normalize,
} from './provider.js';
export { MockEmbeddingsProvider };
export { OpenAICompatibleEmbeddingsProvider };

/**
 * Resolve the embeddings provider per `EMBEDDINGS_PROVIDER` env var.
 *
 * Supported values:
 *   - `mock`              — deterministic SHA-256+ChaCha20 (wire-stable, CI tests + early dev).
 *   - `openai-compatible` — HTTP client to any OpenAI-shape `/embeddings` endpoint
 *                           (Ollama, vLLM, llama.cpp server, OpenAI cloud, Kvendra
 *                           Cloud Embeddings API, bedrock-access-gateway proxy).
 *                           Requires `EMBEDDINGS_BASE_URL` and `EMBEDDINGS_MODEL`.
 *                           Optional `EMBEDDINGS_API_KEY`, `EMBEDDINGS_TIMEOUT_MS`.
 *   - `bedrock`           — NOT available in Platform AGPL build. Implementation
 *                           lives in kvendra-enterprise per ADR-KVD-1823F7 Open Core.
 *                           Use `openai-compatible` pointing to `bedrock-access-gateway`
 *                           if you need Bedrock in self-host.
 */
export function resolveEmbeddingsProvider(kind: string): EmbeddingsProvider {
  switch (kind) {
    case 'mock':
      return new MockEmbeddingsProvider();
    case 'openai-compatible': {
      const baseUrl = process.env.EMBEDDINGS_BASE_URL;
      const model = process.env.EMBEDDINGS_MODEL;
      if (!baseUrl || !model) {
        throw new Error(
          'EMBEDDINGS_PROVIDER=openai-compatible requires EMBEDDINGS_BASE_URL and EMBEDDINGS_MODEL env vars.',
        );
      }
      const apiKey = process.env.EMBEDDINGS_API_KEY;
      const timeoutRaw = process.env.EMBEDDINGS_TIMEOUT_MS;
      const timeoutMs = timeoutRaw ? parseInt(timeoutRaw, 10) : undefined;
      if (timeoutMs !== undefined && (!Number.isFinite(timeoutMs) || timeoutMs <= 0)) {
        throw new Error(
          `EMBEDDINGS_TIMEOUT_MS must be a positive integer, got "${timeoutRaw}".`,
        );
      }
      return new OpenAICompatibleEmbeddingsProvider({
        baseUrl,
        model,
        apiKey,
        timeoutMs,
      });
    }
    case 'bedrock':
      throw new Error(
        'Bedrock provider lives in kvendra-enterprise (ADR-KVD-1823F7 Open Core). ' +
          'NOT available in Platform AGPL build. Use EMBEDDINGS_PROVIDER=openai-compatible ' +
          'pointing to a bedrock-access-gateway proxy if you need Bedrock in self-host.',
      );
    default:
      throw new Error(
        `Unknown EMBEDDINGS_PROVIDER "${kind}". Allowed: mock | openai-compatible | bedrock.`,
      );
  }
}
