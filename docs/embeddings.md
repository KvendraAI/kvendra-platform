<!-- SPDX-License-Identifier: AGPL-3.0-only -->

# Embeddings configuration

`kvendra-platform` resolves an embeddings provider at startup from the
`EMBEDDINGS_PROVIDER` env var. Three providers are supported:

| Value | Where it lives | Tier | Use case |
|---|---|---|---|
| `mock` | `kvendra-platform` (AGPL) | — | CI tests, early dev, demos. Wire-stable per `ADR-KVD-PLATFORM` (SHA-256 + ChaCha20 + L2-normalize). |
| `openai-compatible` | `kvendra-platform` (AGPL) | A / B | Any OpenAI-compatible `/embeddings` endpoint (Ollama, vLLM, llama.cpp, OpenAI cloud, Kvendra Cloud, bedrock-access-gateway proxy). |
| `bedrock` | `kvendra-enterprise` (proprietary) | C | NOT shipped in Platform per `ADR-KVD-1823F7` Open Core boundary. Use `openai-compatible` + bedrock-access-gateway for self-host. |

## Env vars

| Var | Required when | Default | Notes |
|---|---|---|---|
| `EMBEDDINGS_PROVIDER` | always (else error at boot) | none | `mock` \| `openai-compatible` \| `bedrock` |
| `EMBEDDINGS_BASE_URL` | `openai-compatible` | — | E.g. `http://localhost:11434/v1`. Trailing slash optional. |
| `EMBEDDINGS_MODEL` | `openai-compatible` | — | Provider-specific model id (e.g. `mxbai-embed-large`, `text-embedding-3-small`). |
| `EMBEDDINGS_API_KEY` | optional | unset | Bearer token. Omit for local providers (Ollama, llama.cpp) that don't auth. |
| `EMBEDDINGS_TIMEOUT_MS` | optional | 30000 | Per-request timeout in ms. |

## Provider tiers

### Tier A — Kvendra Cloud Embeddings API (free tier)

Aligned with the SaaS by construction. Same wire alias `kvendra-embedding-v1`,
same Bedrock Titan v2 backing model. No quality drift when migrating between
self-host and SaaS.

```yaml
EMBEDDINGS_PROVIDER: openai-compatible
EMBEDDINGS_BASE_URL: https://api.kvendra.com/v1
EMBEDDINGS_MODEL: kvendra-embedding-v1
EMBEDDINGS_API_KEY: <your-key-from-app.kvendra.cloud>
```

> **Status (2026-05)**: Cloud Embeddings API is M1.5 ready in `kvendra-enterprise`
> staging. Public availability is gated on AWS Support case 177850260300533 (Bedrock
> InvokeModel block on the Kvendra account). Track progress in the `ROAD-KVD-716183`
> roadmap.

### Tier B — local OSS provider (Ollama, vLLM, llama.cpp)

100% offline. You manage the model. Quality drift is your responsibility: switching
between providers requires re-embedding the corpus (vectors are not portable across
models — this is a property of embedding spaces, not a Kvendra limitation).

```yaml
EMBEDDINGS_PROVIDER: openai-compatible
EMBEDDINGS_BASE_URL: http://localhost:11434/v1
EMBEDDINGS_MODEL: mxbai-embed-large
# EMBEDDINGS_API_KEY: not needed for local Ollama
```

Recommended models with 1024-dim output (drop-in compatible):

| Provider | Model | Dim | Notes |
|---|---|---|---|
| Ollama | `mxbai-embed-large` | 1024 | Best quality for the 1024-dim slot at the time of writing. |
| OpenAI | `text-embedding-3-small` (1024 dim mode) | 1024 | Cloud paid; use `dimensions=1024` parameter if supported. |
| vLLM | Any 1024-dim embedding model | 1024 | Performance-oriented. |

Models with other dims (e.g. `nomic-embed-text` → 768) **will fail at boot** with
`Expected dim 1024, got 768`. Re-embedding existing data on a dim change is an
out-of-band operation (not covered by `kvendra-platform` v0.1).

### Tier C — full SaaS Kvendra (managed)

Out of scope for `kvendra-platform`. See `kvendra.com/enterprise`.

## Mock provider — CI tests and demos

```yaml
EMBEDDINGS_PROVIDER: mock
```

The mock provider is the default in `docker-compose.yml` for first-run. It is
deterministic (`embed("foo")` always returns the same vector across reboots and
machines) and wire-stable (algorithm frozen per `ADR-KVD-PLATFORM` Amendment
2026-05-14).

**Do NOT use `mock` in production.** Semantic search results are deterministic
noise — useful for testing the wiring, useless for actual retrieval.

## Behavior

- **Dim enforcement**: every vector returned by the provider is validated against
  `EMBEDDING_DIM = 1024`. Mismatch → fail-fast at request time.
- **L2-normalization**: the platform re-normalizes outputs if the provider drifts
  more than `1e-4` from unit norm. Re-normalization is logged at WARN level.
- **No retries**: on timeout or transport error, the platform propagates the error
  to the MCP client. The client decides whether to retry.
- **Batching limits**: max 32 inputs per request, max 8192 chars per input.
  Exceed → fail-fast with a descriptive error.
- **Logging is non-PII**: only `model`, `dim`, `latency_ms`, and `error_code` are
  logged. Input text is **never** logged.

## See also

- [`README.md`](../README.md) for the platform overview.
- [`docs/mcp-tools.md`](./mcp-tools.md) for the 14 MCP tools that consume embeddings.
