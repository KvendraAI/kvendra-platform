<!-- SPDX-License-Identifier: AGPL-3.0-only -->

# Embeddings configuration

`kvendra-platform` resolves an embeddings provider at startup from the
`EMBEDDINGS_PROVIDER` env var. Three providers are supported:

| Value | Where it lives | Tier | Use case |
|---|---|---|---|
| `mock` | `kvendra-platform` (AGPL) | — | CI tests, early dev, demos. Wire-stable per `ADR-KVD-PLATFORM` (SHA-256 + ChaCha20 + L2-normalize). |
| `openai-compatible` | `kvendra-platform` (AGPL) | B | Any OpenAI-compatible `/embeddings` endpoint serving a 1024-dim model (Ollama, vLLM, TEI, llama.cpp, Mistral, LiteLLM / bedrock-access-gateway proxy). |
| `bedrock` | `kvendra-enterprise` (proprietary) | C | NOT shipped in Platform per `ADR-KVD-1823F7` Open Core boundary. Use `openai-compatible` + bedrock-access-gateway for self-host. |

## Env vars

| Var | Required when | Default | Notes |
|---|---|---|---|
| `EMBEDDINGS_PROVIDER` | always (else error at boot) | none | `mock` \| `openai-compatible` \| `bedrock` |
| `EMBEDDINGS_BASE_URL` | `openai-compatible` | — | E.g. `http://localhost:11434/v1`. Trailing slash optional. |
| `EMBEDDINGS_MODEL` | `openai-compatible` | — | Provider-specific model id of a natively 1024-dim model (e.g. `mxbai-embed-large`, `bge-large-en-v1.5`, `mistral-embed`). |
| `EMBEDDINGS_API_KEY` | optional | unset | Bearer token. Omit for local providers (Ollama, llama.cpp) that don't auth. |
| `EMBEDDINGS_TIMEOUT_MS` | optional | 30000 | Per-request timeout in ms. |

## Provider tiers

### Tier B — local OSS provider (recommended: Ollama)

100% offline, no account needed. You manage the model. This is the default of the
[`kvendra-reference-stack`](https://github.com/KvendraAI/kvendra-reference-stack)
(`./scripts/up.sh` starts Ollama and pulls `mxbai-embed-large`).

```yaml
EMBEDDINGS_PROVIDER: openai-compatible
EMBEDDINGS_BASE_URL: http://localhost:11434/v1
EMBEDDINGS_MODEL: mxbai-embed-large
# EMBEDDINGS_API_KEY: not needed for local Ollama
```

### Own OpenAI-compatible provider

Any endpoint that follows the OpenAI `/embeddings` shape works, as long as the model
returns **1024-dim vectors natively**: the platform validates 1024 dims and does
**not** send a `dimensions` parameter (it posts only `{model, input}`).

```yaml
EMBEDDINGS_PROVIDER: openai-compatible
EMBEDDINGS_BASE_URL: https://your-provider.example.com/v1
EMBEDDINGS_MODEL: mxbai-embed-large
EMBEDDINGS_API_KEY: <your-provider-key>
```

Recommended models with 1024-dim output (drop-in compatible):

| Provider | Model | Dim | Notes |
|---|---|---|---|
| Ollama | `mxbai-embed-large` | 1024 | Default. Best quality for the 1024-dim slot at the time of writing. |
| vLLM / Hugging Face TEI | `mxbai-embed-large`, `bge-large-en-v1.5` | 1024 | Performance-oriented self-hosted serving. |
| Mistral | `mistral-embed` | 1024 | Hosted, paid. |
| Gateway (e.g. LiteLLM, bedrock-access-gateway) | Bedrock Titan v2, OpenAI `text-embedding-3-*` | 1024 | Only if the gateway pins the output to 1024 dims — the platform does not request it. |

Models with other dims (e.g. `nomic-embed-text` → 768, OpenAI `text-embedding-3-small`
called directly → 1536) **fail at request time** with `Expected dim 1024, got 768`.

### Switching provider = re-embedding

Changing provider **or** model changes the vector space, even when both produce
1024-dim vectors: vectors stored with the old model are not comparable with the new
ones, and semantic search returns incoherent results until the corpus is re-embedded.
Re-embed your existing entities after switching (or start from an empty KB).
Re-embedding is an out-of-band operation (not covered by `kvendra-platform` v0.1).
This is a property of embedding spaces, not a Kvendra limitation.

### Tier C — full SaaS Kvendra (managed)

Out of scope for `kvendra-platform`. See [kvendra.ai](https://kvendra.ai).

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
