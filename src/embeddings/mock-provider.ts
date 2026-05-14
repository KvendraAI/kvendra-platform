/*
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * NOTE: This file is a verbatim copy of the mock embeddings provider
 * originally implemented in kvendra-enterprise
 * (packages/core/src/embeddings/mock-provider.ts).
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

import { createHash } from 'node:crypto';

import { chacha20 } from '@noble/ciphers/chacha';

import {
  EMBEDDING_DIM,
  approxTokenCount,
  l2Normalize,
  type EmbeddingsProvider,
  type EmbeddingsRequest,
  type EmbeddingsResponse,
} from './provider.js';

/**
 * Mock embeddings provider — wire-stable deterministic algorithm.
 *
 * Algorithm (frozen, MUST NOT change without IF-003 major bump):
 *   1. seed = SHA-256(utf8(input))          → 32 bytes
 *   2. ChaCha20(key=seed, nonce=12B zeros, counter=0)
 *      against a 4096-byte zero plaintext   → 4096 bytes keystream
 *   3. Read 1024 u32 little-endian          → float in [-1, 1] via
 *      (u32 / 2^31) - 1
 *   4. L2-normalize                          → unit-norm 1024-dim vector
 *
 * Properties:
 *  - Pure deterministic per input.
 *  - Same wire shape & dim as Bedrock Titan v2 (1024-d, unit-norm).
 *  - No external dependency beyond @noble/ciphers (audited, hash+crypto only).
 */

const ZERO_NONCE = new Uint8Array(12);
const ZERO_PLAINTEXT = new Uint8Array(EMBEDDING_DIM * 4); // 1024 * 4 bytes

function embedOne(input: string): number[] {
  const seed = createHash('sha256').update(input, 'utf8').digest();
  const keystream = chacha20(new Uint8Array(seed), ZERO_NONCE, ZERO_PLAINTEXT);
  const view = new DataView(
    keystream.buffer,
    keystream.byteOffset,
    keystream.byteLength,
  );
  const vec = new Array<number>(EMBEDDING_DIM);
  for (let i = 0; i < EMBEDDING_DIM; i++) {
    const u32 = view.getUint32(i * 4, true);
    // Map u32 → float in [-1, 1]: bits as signed int32 / 2^31.
    const signed = u32 | 0;
    vec[i] = signed / 0x80000000;
  }
  return l2Normalize(vec);
}

export class MockEmbeddingsProvider implements EmbeddingsProvider {
  readonly id = 'mock' as const;

  async embed(req: EmbeddingsRequest): Promise<EmbeddingsResponse> {
    const inputs = Array.isArray(req.input) ? req.input : [req.input];
    const data = inputs.map((text, index) => ({
      index,
      embedding: embedOne(text),
    }));
    let total = 0;
    for (const t of inputs) total += approxTokenCount(t);
    return {
      data,
      prompt_tokens: total,
      total_tokens: total,
    };
  }
}
