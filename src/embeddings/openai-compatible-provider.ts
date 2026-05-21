/* SPDX-License-Identifier: AGPL-3.0-only */

/**
 * OpenAI-compatible embeddings provider.
 *
 * Consumes any HTTP endpoint that follows the OpenAI `/v1/embeddings` shape
 * (Ollama, vLLM, llama.cpp server, OpenAI cloud, LocalAI, Kvendra Cloud
 * Embeddings API, bedrock-access-gateway proxy, etc.).
 *
 * Resolution: per ADR-KVD-PLATFORM (Amendment 2026-05-21) for M1 of
 * ROAD-KVD-716183 (Self-Hosted Community) — Bedrock impl stays in
 * kvendra-enterprise per ADR-KVD-1823F7 Open Core boundary.
 *
 * Config (env vars):
 *   - EMBEDDINGS_PROVIDER=openai-compatible
 *   - EMBEDDINGS_BASE_URL — e.g. http://localhost:11434/v1 (Ollama)
 *   - EMBEDDINGS_MODEL — e.g. mxbai-embed-large
 *   - EMBEDDINGS_API_KEY (optional — Ollama local doesn't need it)
 *   - EMBEDDINGS_TIMEOUT_MS (optional — default 30000)
 *
 * Wire-public guarantees (per IF-KVD-ENTERPRISE-25BF5A v1.0.3 reference):
 *   - 1024-dim vectors (fail-fast on mismatch).
 *   - L2-normalized output (re-normalize if provider drifts > 1e-4).
 *   - Same response shape as MockEmbeddingsProvider (drop-in compatible).
 */

import pino from 'pino';

import {
  EMBEDDING_DIM,
  approxTokenCount,
  l2Normalize,
  type EmbeddingsProvider,
  type EmbeddingsRequest,
  type EmbeddingsResponse,
} from './provider.js';

export interface OpenAICompatibleConfig {
  /** Base URL of the OpenAI-compatible endpoint (without trailing slash). */
  baseUrl: string;
  /** Model identifier the provider expects (e.g. `mxbai-embed-large`). */
  model: string;
  /** Optional bearer token; omit for local providers without auth. */
  apiKey?: string;
  /** Request timeout in milliseconds. Default 30000 (30s). */
  timeoutMs?: number;
  /** Pino logger child (mostly for tests). Defaults to a module-level instance. */
  logger?: pino.Logger;
}

const DEFAULT_TIMEOUT_MS = 30000;
const MAX_BATCH = 32;
const MAX_CHARS_PER_INPUT = 8192;
const L2_NORM_EPSILON = 1e-4;

const moduleLogger: pino.Logger = pino({ name: 'openai-compatible-provider' });

export class OpenAICompatibleEmbeddingsProvider implements EmbeddingsProvider {
  readonly id = 'openai-compatible' as const;

  private readonly baseUrl: string;
  private readonly model: string;
  private readonly apiKey: string | undefined;
  private readonly timeoutMs: number;
  private readonly logger: pino.Logger;

  constructor(config: OpenAICompatibleConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, '');
    this.model = config.model;
    this.apiKey = config.apiKey;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.logger = (config.logger ?? moduleLogger).child({
      provider: 'openai-compatible',
      model: this.model,
    });
  }

  /**
   * Embed one or more input strings.
   *
   * Throws on:
   *   - batch overflow (> 32 inputs)
   *   - per-input char overflow (> 8192 chars)
   *   - network error / abort (timeout)
   *   - HTTP non-2xx response
   *   - invalid JSON body
   *   - unexpected response shape
   *   - dim mismatch (provider returned vectors with dim ≠ 1024)
   */
  async embed(req: EmbeddingsRequest): Promise<EmbeddingsResponse> {
    const inputs = Array.isArray(req.input) ? req.input : [req.input];

    if (inputs.length === 0) {
      throw new Error('Embeddings request must have at least one input.');
    }
    if (inputs.length > MAX_BATCH) {
      throw new Error(
        `Batch overflow: max ${MAX_BATCH} inputs, got ${inputs.length}.`,
      );
    }
    for (let i = 0; i < inputs.length; i++) {
      const s = inputs[i] ?? '';
      if (s.length > MAX_CHARS_PER_INPUT) {
        throw new Error(
          `Input[${i}] overflow: max ${MAX_CHARS_PER_INPUT} chars, got ${s.length}.`,
        );
      }
    }

    const url = `${this.baseUrl}/embeddings`;
    const headers: Record<string, string> = {
      'content-type': 'application/json',
    };
    if (this.apiKey) {
      headers['authorization'] = `Bearer ${this.apiKey}`;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const start = Date.now();

    let resp: Response;
    try {
      resp = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ model: this.model, input: inputs }),
        signal: controller.signal,
      });
    } catch (err: unknown) {
      const latency_ms = Date.now() - start;
      const e = err as { name?: string; message?: string };
      if (e.name === 'AbortError') {
        this.logger.error({ latency_ms, error_code: 'timeout' });
        throw new Error(
          `Embeddings provider timeout after ${this.timeoutMs}ms at ${url}.`,
        );
      }
      this.logger.error({ latency_ms, error_code: 'network' });
      throw new Error(
        `Embeddings provider unreachable at ${url}: ${e.message ?? 'unknown error'}.`,
      );
    } finally {
      clearTimeout(timer);
    }

    const latency_ms = Date.now() - start;

    if (!resp.ok) {
      const status = resp.status;
      const bodyText = await resp.text().catch(() => '<unreadable>');
      this.logger.error({ latency_ms, error_code: `http_${status}` });
      throw new Error(
        `Embeddings provider ${url} returned ${status}: ${bodyText.slice(0, 200)}`,
      );
    }

    let json: unknown;
    try {
      json = await resp.json();
    } catch {
      this.logger.error({ latency_ms, error_code: 'parse' });
      throw new Error(`Embeddings provider returned invalid JSON from ${url}.`);
    }

    const vectors = parseResponseShape(json, inputs.length, url);

    const data = vectors.map((vec, index) => {
      if (vec.length !== EMBEDDING_DIM) {
        this.logger.error({
          latency_ms,
          error_code: 'dim_mismatch',
          dim: vec.length,
        });
        throw new Error(
          `Expected dim ${EMBEDDING_DIM}, got ${vec.length} from model ${this.model}.`,
        );
      }
      // Verify L2-norm; renormalize if drift > epsilon.
      let sumSq = 0;
      for (const v of vec) sumSq += v * v;
      const magnitude = Math.sqrt(sumSq);
      if (Math.abs(magnitude - 1.0) > L2_NORM_EPSILON) {
        this.logger.warn({ magnitude, action: 'renormalize' });
        l2Normalize(vec);
      }
      return { index, embedding: vec };
    });

    let total = 0;
    for (const s of inputs) total += approxTokenCount(s);

    this.logger.info({
      latency_ms,
      dim: EMBEDDING_DIM,
      count: inputs.length,
    });

    return { data, prompt_tokens: total, total_tokens: total };
  }
}

/**
 * Parse the embeddings response shape tolerantly.
 *
 * Supports:
 *   1. OpenAI canonical: `{ object: "list", data: [{ embedding: [...] }, ...], model, usage }`.
 *   2. Ollama variant (single input only): `{ embedding: [...] }`.
 *
 * Anything else → throw with the originating URL for debuggability.
 */
function parseResponseShape(
  json: unknown,
  expectedCount: number,
  url: string,
): number[][] {
  if (!json || typeof json !== 'object') {
    throw new Error(`Unexpected response shape from ${url}: not an object.`);
  }
  const obj = json as Record<string, unknown>;

  if (Array.isArray(obj.data)) {
    const arr = obj.data as Array<{ embedding?: unknown }>;
    return arr.map((item, i) => {
      if (!Array.isArray(item.embedding)) {
        throw new Error(
          `Unexpected response shape from ${url}: data[${i}].embedding is not an array.`,
        );
      }
      return item.embedding as number[];
    });
  }

  if (Array.isArray(obj.embedding)) {
    if (expectedCount !== 1) {
      throw new Error(
        `Ollama-variant response only supports a single input, expected ${expectedCount}.`,
      );
    }
    return [obj.embedding as number[]];
  }

  throw new Error(
    `Unexpected response shape from ${url}: missing 'data' or 'embedding' key.`,
  );
}
