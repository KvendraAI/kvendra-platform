/* SPDX-License-Identifier: AGPL-3.0-only */

/**
 * E2E integration test against a local Ollama instance.
 *
 * SKIP by default. Enable with:
 *   OLLAMA_E2E_ENABLED=true \
 *   OLLAMA_BASE_URL=http://localhost:11434/v1 \
 *   OLLAMA_MODEL=mxbai-embed-large \
 *   npm run test:e2e
 *
 * Pre-requisites:
 *   - `ollama serve` running locally.
 *   - `ollama pull mxbai-embed-large` (1024-dim model).
 *
 * Failure modes covered: dim mismatch, network unreachable, HTTP 4xx/5xx.
 * This is a smoke test — full coverage lives in tests/unit/.
 */

import { describe, expect, it } from 'vitest';

import { EMBEDDING_DIM } from '../../../src/embeddings/provider.js';
import { OpenAICompatibleEmbeddingsProvider } from '../../../src/embeddings/openai-compatible-provider.js';

const enabled = process.env.OLLAMA_E2E_ENABLED === 'true';
const baseUrl = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434/v1';
const model = process.env.OLLAMA_MODEL ?? 'mxbai-embed-large';

describe.skipIf(!enabled)('Ollama E2E (skipped by default)', () => {
  it('embed("hello world") returns 1024-dim L2-normalized vector', async () => {
    const provider = new OpenAICompatibleEmbeddingsProvider({
      baseUrl,
      model,
      timeoutMs: 60000,
    });

    const res = await provider.embed({ input: 'hello world' });

    expect(res.data).toHaveLength(1);
    expect(res.data[0]!.embedding).toHaveLength(EMBEDDING_DIM);

    const sum = res.data[0]!.embedding.reduce((s, x) => s + x * x, 0);
    expect(Math.abs(Math.sqrt(sum) - 1)).toBeLessThan(1e-3);

    expect(res.prompt_tokens).toBeGreaterThan(0);
  }, 90000);
});
