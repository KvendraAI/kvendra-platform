/*
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * NOTE: This file is a verbatim copy of the embeddings provider abstraction
 * originally implemented in kvendra-enterprise
 * (packages/core/src/embeddings/provider.ts).
 *
 * The owner of both kvendra-enterprise (Proprietary) and kvendra-platform
 * (AGPL-3.0-only) is the same legal entity (Juan Pérez Buján / Kvendra),
 * who is the licensor and explicitly dual-licenses this file:
 *   - In kvendra-enterprise: under the proprietary license.
 *   - In kvendra-platform:   under AGPL-3.0-only.
 *
 * The mock embedding algorithm (SHA-256 → ChaCha20 → 1024 u32 LE → [-1,1]
 * → L2-norm) is wire-stable per ADR-KVD-024 amendment 2026-05-14 and MUST
 * NOT change without coordinating an IF major bump.
 */

/**
 * IF-KVD-ENTERPRISE-003 — Embeddings provider abstraction.
 *
 * Wire-public consumers only ever see the model alias `kvendra-embedding-v1`
 * and receive 1024-dim unit L2-normalized float vectors. The provider
 * identity (`mock` | `bedrock`) is internal and resolved at runtime via
 * `EMBEDDINGS_PROVIDER` env var. See ADR-KVD-026.
 */

/** Stable wire-public model alias exposed to clients. */
export const KVENDRA_EMBEDDING_MODEL = 'kvendra-embedding-v1' as const;

/** Embedding vector dimensionality (1024 floats, unit L2-norm). */
export const EMBEDDING_DIM = 1024 as const;

/** Internal provider id — never leaked on the wire. */
export type EmbeddingsProviderId = 'mock' | 'bedrock' | 'openai-compatible';

export interface EmbeddingsRequest {
  /** Single string or list of strings to embed (max 32 items, 8192 chars each). */
  input: string | string[];
}

export interface EmbeddingItem {
  /** Index into the input array (0 if input was a single string). */
  index: number;
  /** 1024-dim unit L2-normalized vector. */
  embedding: number[];
}

export interface EmbeddingsResponse {
  data: EmbeddingItem[];
  /** Approx prompt tokens (ceil(chars/4)) — consistent across providers for quota. */
  prompt_tokens: number;
  total_tokens: number;
}

export interface EmbeddingsProvider {
  /** Internal id — exposed via CloudWatch metric only, never on the wire. */
  readonly id: EmbeddingsProviderId;
  embed(req: EmbeddingsRequest): Promise<EmbeddingsResponse>;
}

/** Token-count heuristic used by both providers to keep quota stable. */
export function approxTokenCount(text: string): number {
  return Math.ceil(text.length / 4);
}

/** L2-normalize a float vector in place (returns the same array). */
export function l2Normalize(vec: number[]): number[] {
  let sum = 0;
  for (const v of vec) sum += v * v;
  if (sum === 0) return vec;
  const inv = 1 / Math.sqrt(sum);
  for (let i = 0; i < vec.length; i++) {
    const v = vec[i] ?? 0;
    vec[i] = v * inv;
  }
  return vec;
}
