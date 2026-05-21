/* SPDX-License-Identifier: AGPL-3.0-only */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EMBEDDING_DIM } from '../../../src/embeddings/provider.js';
import { OpenAICompatibleEmbeddingsProvider } from '../../../src/embeddings/openai-compatible-provider.js';

const BASE_URL = 'http://test-provider.local/v1';
const MODEL = 'test-embed-model';

function makeOpenAICanonicalResponse(vectors: number[][]) {
  return {
    object: 'list',
    data: vectors.map((embedding, index) => ({
      object: 'embedding',
      index,
      embedding,
    })),
    model: MODEL,
    usage: { prompt_tokens: 42, total_tokens: 42 },
  };
}

function makeOllamaVariantResponse(vector: number[]) {
  return { embedding: vector };
}

function makeNormalizedVector(dim: number, fillValue = 1): number[] {
  // Start with [fillValue, ...], L2-normalize so magnitude = 1.
  const v = new Array<number>(dim).fill(fillValue);
  let sum = 0;
  for (const x of v) sum += x * x;
  const inv = 1 / Math.sqrt(sum);
  return v.map((x) => x * inv);
}

function mockFetchOk(body: unknown): typeof fetch {
  return vi.fn(async () => {
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as unknown as typeof fetch;
}

function mockFetchStatus(status: number, body = ''): typeof fetch {
  return vi.fn(async () => {
    return new Response(body, { status });
  }) as unknown as typeof fetch;
}

function mockFetchInvalidJson(): typeof fetch {
  return vi.fn(async () => {
    return new Response('not-json-{[}', {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as unknown as typeof fetch;
}

function mockFetchAbort(): typeof fetch {
  return vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    return new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal;
      if (signal) {
        signal.addEventListener('abort', () => {
          const err = new Error('aborted') as Error & { name: string };
          err.name = 'AbortError';
          reject(err);
        });
      }
    });
  }) as unknown as typeof fetch;
}

const originalFetch = globalThis.fetch;

describe('OpenAICompatibleEmbeddingsProvider', () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('AC8.1 — success path: returns L2-normalized 1024-dim vectors from OpenAI canonical shape', async () => {
    const v = makeNormalizedVector(EMBEDDING_DIM);
    globalThis.fetch = mockFetchOk(makeOpenAICanonicalResponse([v, v]));
    const provider = new OpenAICompatibleEmbeddingsProvider({
      baseUrl: BASE_URL,
      model: MODEL,
    });

    const res = await provider.embed({ input: ['hello', 'world'] });

    expect(res.data).toHaveLength(2);
    expect(res.data[0]!.index).toBe(0);
    expect(res.data[0]!.embedding).toHaveLength(EMBEDDING_DIM);
    // Magnitude should be ~1.
    const sum = res.data[0]!.embedding.reduce((s, x) => s + x * x, 0);
    expect(Math.abs(Math.sqrt(sum) - 1)).toBeLessThan(1e-3);
    expect(res.prompt_tokens).toBeGreaterThan(0);
  });

  it('AC8.2 — variant Ollama shape: { embedding: [...] } with single input', async () => {
    const v = makeNormalizedVector(EMBEDDING_DIM);
    globalThis.fetch = mockFetchOk(makeOllamaVariantResponse(v));
    const provider = new OpenAICompatibleEmbeddingsProvider({
      baseUrl: BASE_URL,
      model: MODEL,
    });

    const res = await provider.embed({ input: 'hello' });

    expect(res.data).toHaveLength(1);
    expect(res.data[0]!.embedding).toHaveLength(EMBEDDING_DIM);
  });

  it('AC8.3 — dim mismatch: provider returns wrong-dim vector → throw', async () => {
    const wrongDim = makeNormalizedVector(768); // not 1024
    globalThis.fetch = mockFetchOk(makeOpenAICanonicalResponse([wrongDim]));
    const provider = new OpenAICompatibleEmbeddingsProvider({
      baseUrl: BASE_URL,
      model: MODEL,
    });

    await expect(provider.embed({ input: 'hello' })).rejects.toThrow(
      /Expected dim 1024, got 768/,
    );
  });

  it('AC8.4 — timeout: AbortController fires → throw with timeout message', async () => {
    globalThis.fetch = mockFetchAbort();
    const provider = new OpenAICompatibleEmbeddingsProvider({
      baseUrl: BASE_URL,
      model: MODEL,
      timeoutMs: 50,
    });

    await expect(provider.embed({ input: 'hello' })).rejects.toThrow(
      /timeout after 50ms/,
    );
  });

  it('AC8.5a — auth header PRESENT when apiKey set', async () => {
    const v = makeNormalizedVector(EMBEDDING_DIM);
    const fetchSpy = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      const headers = init?.headers as Record<string, string>;
      expect(headers['authorization']).toBe('Bearer test-key-abc');
      return new Response(JSON.stringify(makeOpenAICanonicalResponse([v])), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const provider = new OpenAICompatibleEmbeddingsProvider({
      baseUrl: BASE_URL,
      model: MODEL,
      apiKey: 'test-key-abc',
    });
    await provider.embed({ input: 'hello' });
    expect(fetchSpy).toHaveBeenCalledOnce();
  });

  it('AC8.5b — auth header ABSENT when apiKey not set', async () => {
    const v = makeNormalizedVector(EMBEDDING_DIM);
    const fetchSpy = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      const headers = init?.headers as Record<string, string>;
      expect(headers['authorization']).toBeUndefined();
      return new Response(JSON.stringify(makeOpenAICanonicalResponse([v])), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const provider = new OpenAICompatibleEmbeddingsProvider({
      baseUrl: BASE_URL,
      model: MODEL,
    });
    await provider.embed({ input: 'hello' });
    expect(fetchSpy).toHaveBeenCalledOnce();
  });

  it('AC8.6 — batch overflow: > 32 inputs → throw', async () => {
    const provider = new OpenAICompatibleEmbeddingsProvider({
      baseUrl: BASE_URL,
      model: MODEL,
    });
    const tooMany = new Array<string>(33).fill('x');
    await expect(provider.embed({ input: tooMany })).rejects.toThrow(
      /Batch overflow: max 32 inputs, got 33/,
    );
  });

  it('AC8.7 — char overflow: input > 8192 chars → throw', async () => {
    const provider = new OpenAICompatibleEmbeddingsProvider({
      baseUrl: BASE_URL,
      model: MODEL,
    });
    const tooLong = 'a'.repeat(8193);
    await expect(provider.embed({ input: tooLong })).rejects.toThrow(
      /Input\[0\] overflow: max 8192 chars, got 8193/,
    );
  });

  it('AC8.8 — L2-norm verification: provider returns un-normalized vector → re-normalize', async () => {
    // Vector with magnitude clearly > 1.
    const unnormalized = new Array<number>(EMBEDDING_DIM).fill(0.5);
    globalThis.fetch = mockFetchOk(makeOpenAICanonicalResponse([unnormalized]));
    const provider = new OpenAICompatibleEmbeddingsProvider({
      baseUrl: BASE_URL,
      model: MODEL,
    });

    const res = await provider.embed({ input: 'hello' });
    const vec = res.data[0]!.embedding;
    const sum = vec.reduce((s, x) => s + x * x, 0);
    expect(Math.abs(Math.sqrt(sum) - 1)).toBeLessThan(1e-6);
  });

  it('AC8.9 — parse failure: invalid JSON → throw', async () => {
    globalThis.fetch = mockFetchInvalidJson();
    const provider = new OpenAICompatibleEmbeddingsProvider({
      baseUrl: BASE_URL,
      model: MODEL,
    });
    await expect(provider.embed({ input: 'hello' })).rejects.toThrow(
      /invalid JSON/,
    );
  });

  it('AC8.10 — HTTP non-2xx: provider returns 500 → throw with status', async () => {
    globalThis.fetch = mockFetchStatus(500, 'internal server error');
    const provider = new OpenAICompatibleEmbeddingsProvider({
      baseUrl: BASE_URL,
      model: MODEL,
    });
    await expect(provider.embed({ input: 'hello' })).rejects.toThrow(
      /returned 500/,
    );
  });

  it('strips trailing slash from baseUrl', async () => {
    const v = makeNormalizedVector(EMBEDDING_DIM);
    const fetchSpy = vi.fn(async (url: RequestInfo | URL) => {
      expect(String(url)).toBe(`${BASE_URL}/embeddings`);
      return new Response(JSON.stringify(makeOpenAICanonicalResponse([v])), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const provider = new OpenAICompatibleEmbeddingsProvider({
      baseUrl: `${BASE_URL}///`,
      model: MODEL,
    });
    await provider.embed({ input: 'hello' });
  });

  it('Ollama-variant rejects multi-input', async () => {
    const v = makeNormalizedVector(EMBEDDING_DIM);
    globalThis.fetch = mockFetchOk(makeOllamaVariantResponse(v));
    const provider = new OpenAICompatibleEmbeddingsProvider({
      baseUrl: BASE_URL,
      model: MODEL,
    });
    await expect(
      provider.embed({ input: ['hello', 'world'] }),
    ).rejects.toThrow(/Ollama-variant response only supports a single input/);
  });

  it('throws on empty input array', async () => {
    const provider = new OpenAICompatibleEmbeddingsProvider({
      baseUrl: BASE_URL,
      model: MODEL,
    });
    await expect(provider.embed({ input: [] })).rejects.toThrow(
      /at least one input/,
    );
  });
});

describe('MockEmbeddingsProvider regression (AC4 — mock-provider.ts NOT touched)', () => {
  it('still produces deterministic 1024-dim L2-normalized vectors', async () => {
    // Verify the mock module is reachable and the wire-stable algorithm is intact.
    const { MockEmbeddingsProvider } = await import(
      '../../../src/embeddings/mock-provider.js'
    );
    const mock = new MockEmbeddingsProvider();
    const out = await mock.embed({ input: 'hello world' });
    expect(out.data).toHaveLength(1);
    expect(out.data[0]!.embedding).toHaveLength(EMBEDDING_DIM);

    // Determinism: same input → same vector.
    const out2 = await mock.embed({ input: 'hello world' });
    expect(out2.data[0]!.embedding).toEqual(out.data[0]!.embedding);

    // L2-norm.
    const sum = out.data[0]!.embedding.reduce((s, x) => s + x * x, 0);
    expect(Math.abs(Math.sqrt(sum) - 1)).toBeLessThan(1e-6);
  });
});

describe('resolveEmbeddingsProvider switch (AC1, AC4)', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.EMBEDDINGS_BASE_URL;
    delete process.env.EMBEDDINGS_MODEL;
    delete process.env.EMBEDDINGS_API_KEY;
    delete process.env.EMBEDDINGS_TIMEOUT_MS;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('AC1 — resolves openai-compatible with required env', async () => {
    const { resolveEmbeddingsProvider } = await import(
      '../../../src/embeddings/index.js'
    );
    process.env.EMBEDDINGS_BASE_URL = BASE_URL;
    process.env.EMBEDDINGS_MODEL = MODEL;
    const provider = resolveEmbeddingsProvider('openai-compatible');
    expect(provider.id).toBe('openai-compatible');
  });

  it('AC1 — throws when openai-compatible missing env', async () => {
    const { resolveEmbeddingsProvider } = await import(
      '../../../src/embeddings/index.js'
    );
    expect(() => resolveEmbeddingsProvider('openai-compatible')).toThrow(
      /requires EMBEDDINGS_BASE_URL and EMBEDDINGS_MODEL/,
    );
  });

  it('AC4 — mock still resolves verbatim', async () => {
    const { resolveEmbeddingsProvider } = await import(
      '../../../src/embeddings/index.js'
    );
    const provider = resolveEmbeddingsProvider('mock');
    expect(provider.id).toBe('mock');
  });

  it('bedrock throws with Open Core message', async () => {
    const { resolveEmbeddingsProvider } = await import(
      '../../../src/embeddings/index.js'
    );
    expect(() => resolveEmbeddingsProvider('bedrock')).toThrow(
      /lives in kvendra-enterprise/,
    );
  });

  it('unknown kind throws with allowed values listed', async () => {
    const { resolveEmbeddingsProvider } = await import(
      '../../../src/embeddings/index.js'
    );
    expect(() => resolveEmbeddingsProvider('something-else')).toThrow(
      /Allowed: mock \| openai-compatible \| bedrock/,
    );
  });

  it('throws when EMBEDDINGS_TIMEOUT_MS is invalid', async () => {
    const { resolveEmbeddingsProvider } = await import(
      '../../../src/embeddings/index.js'
    );
    process.env.EMBEDDINGS_BASE_URL = BASE_URL;
    process.env.EMBEDDINGS_MODEL = MODEL;
    process.env.EMBEDDINGS_TIMEOUT_MS = 'not-a-number';
    expect(() => resolveEmbeddingsProvider('openai-compatible')).toThrow(
      /EMBEDDINGS_TIMEOUT_MS must be a positive integer/,
    );
  });
});
