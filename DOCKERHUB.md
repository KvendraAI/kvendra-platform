# kvendra-platform

**Single-tenant knowledge-base engine for AI-assisted development.** Typed entities, transactional changelog, MCP server over HTTP. AGPL-3.0.

Kvendra Platform is the structural core that any MCP-native AI assistant (Claude Code, custom agents, etc.) can call to read/write/query a strongly-typed project KB. Use it self-hosted on your laptop, or as the engine behind a Kvendra Cloud workspace.

- **Source**: https://github.com/KvendraAI/kvendra-platform
- **Full self-hosted stack**: https://github.com/KvendraAI/kvendra-reference-stack (docker-compose with Postgres + Platform + backup + optional Ollama)
- **Managed mode**: https://kvendra.cloud (Kvendra Cloud — free tier 200k tokens/month for embeddings)

---

## Quick start

The Platform needs a PostgreSQL database with the `pgvector` extension. The simplest way is the reference-stack docker-compose:

```bash
git clone https://github.com/KvendraAI/kvendra-reference-stack
cd kvendra-reference-stack
cp .env.example .env
# Edit .env — paste your Kvendra API key (signup at https://kvendra.cloud)
./scripts/up.sh
# Stack up: 3 containers (db + platform + backup).
curl http://localhost:7777/healthz
# {"status":"ok","schema_version":"v1.0"}
```

If you only want this image standalone, see "Standalone (without docker-compose)" below.

---

## What this image is

| Property | Value |
|---|---|
| **Image** | `kvendra/kvendra-platform` |
| **Tags** | `0.1.0-alpha.0`, `latest` |
| **Base** | `node:20-alpine` (multi-stage build) |
| **Architecture** | linux/amd64 |
| **Size** | ~194 MB |
| **License** | AGPL-3.0 |
| **Default port** | `7777` (HTTP, configurable via `PORT`) |
| **Volume** | `/data` (auth token, runtime state) |
| **User** | `node` (non-root) |

The image exposes a single Node.js process that serves:

- `GET /healthz` — health probe (no auth).
- `POST /mcp` — MCP JSON-RPC endpoint (Bearer auth via `/data/auth.token`).
- 14 MCP tools across 6 entity types in M1 alpha (`PRJ`, `CMP`, `IF`, `REQ`, `TEST`, `ISSUE`, `REL`); 13 more entity types in M2 roadmap.

The auth token is bootstrapped on first boot into `/data/auth.token` (file mode 0600). The Platform does NOT bundle Postgres, embeddings, or an LLM — those are external dependencies.

---

## Environment variables

| Variable | Default | Required | Description |
|---|---|---|---|
| `DATABASE_URL` | — | **yes** | Postgres connection string. Example: `postgres://kvendra:kvendra@db:5432/kvendra_platform`. The DB must have the `pgvector` extension installed. |
| `PORT` | `7777` | no | HTTP port inside the container. |
| `HOST` | `0.0.0.0` | no | HTTP bind address. |
| `AUTH_TOKEN_FILE` | `/data/auth.token` | no | Path inside the container where the bootstrap auth token is written. |
| `LOG_LEVEL` | `info` | no | `debug | info | warn | error`. |
| `STAGE` | `local` | no | Informational tag for logs. |
| `EMBEDDINGS_PROVIDER` | `mock` | no | `openai-compatible | bedrock | mock`. See "Three modes" below. |
| `EMBEDDINGS_BASE_URL` | — | depends | When `openai-compatible`, the base URL (e.g. `https://api.kvendra.cloud/v1` or `http://ollama:11434/v1`). |
| `EMBEDDINGS_MODEL` | — | depends | When `openai-compatible`, the model alias (e.g. `kvendra-embedding-v1` or `mxbai-embed-large`). |
| `EMBEDDINGS_API_KEY` | — | depends | When the provider requires auth (e.g. Kvendra Cloud). |
| `EMBEDDINGS_TIMEOUT_MS` | `30000` | no | HTTP timeout for embedding calls. |

---

## Three modes

The Platform stores entity content + a 1024-dim vector embedding for each. The embedding provider is pluggable. Pick one:

### Mode 1 — **Cloud** (default in the reference-stack, easiest)

Use Kvendra Cloud embeddings (free tier: 200k tokens/month). Signup at https://kvendra.cloud, generate an API key, paste it in.

```yaml
EMBEDDINGS_PROVIDER: openai-compatible
EMBEDDINGS_BASE_URL: https://api.kvendra.cloud/v1
EMBEDDINGS_MODEL: kvendra-embedding-v1
EMBEDDINGS_API_KEY: kvd_live_<your-key>
```

Pros: zero local compute, identical vectors to Kvendra Cloud SaaS.
Cons: requires signup + outbound HTTPS to `api.kvendra.cloud`.

### Mode 2 — **Ollama local** (no signup, fully local)

Run Ollama on the same machine and point the Platform at it:

```yaml
EMBEDDINGS_PROVIDER: openai-compatible
EMBEDDINGS_BASE_URL: http://ollama:11434/v1
EMBEDDINGS_MODEL: mxbai-embed-large
# No EMBEDDINGS_API_KEY needed
```

The reference-stack provides an Ollama service via the `ollama` compose profile:

```bash
docker compose --profile ollama up -d
# or: ./scripts/up.sh --with-ollama
```

Pros: 100% offline after model pull, no Kvendra account, no per-token cost.
Cons: ~5 GB model download on first run; lower-quality vectors than Kvendra Cloud (production-grade vs community model).

### Mode 3 — **Mock** (CI/dev only)

Deterministic test vectors with no external calls:

```yaml
EMBEDDINGS_PROVIDER: mock
# Other EMBEDDINGS_* vars ignored
```

Pros: hermetic, zero deps, perfect for unit tests + CI.
Cons: vectors are not semantically meaningful — searches return arbitrary results.

To switch modes after the stack is up: edit `.env` + `docker compose restart kvendra-platform`. Existing entities keep the vectors they were embedded with — re-embed manually if you change providers (the Platform exposes a CLI command for this, see GitHub README).

---

## Use with Claude Code (recommended orchestrator)

The Platform is a passive MCP server. Any MCP-native client can drive it. For Claude Code:

### Step 1 — Get the bootstrap auth token

The Platform writes the token to `/data/auth.token` (mode 0600) **inside the container** on first boot. How you read it depends on how `/data` is wired:

- **Reference-stack** (`./scripts/up.sh`): `/data` is bind-mounted to `./data/` on the host, so the file appears at `./data/auth.token`:

  ```bash
  TOKEN=$(cat ./data/auth.token)
  ```

- **Docker named volume** (e.g. `kvendra_platform_data:/data` in compose, the default in `docker-compose.yml`): nothing appears on the host. Read it from the container directly:

  ```bash
  TOKEN=$(docker exec kvendra-ref-platform cat /data/auth.token)
  # or, if you ran the standalone example below: docker exec kvendra-platform ...
  ```

- **Plain `docker run` without `-v`**: the volume is anonymous and the token dies with the container. You almost certainly want one of the two options above.

### Step 2 — Register the MCP server with Claude Code

```bash
claude mcp add kvendra-platform http://localhost:7777/mcp \
  -H "Authorization: Bearer $TOKEN"
```

### Step 3 — (Recommended) install the kvendra-skills plugin

The `kvendra-skills` plugin ships pre-built workflows (consultancy, new-feature pipeline, code review, etc.) that drive the Platform's MCP tools. Install it from the Kvendra marketplace:

```bash
# Add the marketplace once (Claude Code 0.4+ syntax):
claude plugin marketplace add KvendraAI/kvendra-marketplace

# Install the plugin:
claude plugin install kvendra-skills@KvendraAI/kvendra-marketplace
```

If your Claude Code version is older or the CLI flags differ, the same is reachable from inside Claude Code via `/plugin marketplace add KvendraAI/kvendra-marketplace` and `/plugin install kvendra-skills@KvendraAI/kvendra-marketplace`.

Now Claude Code can read/write entities (`entity_create`, `entity_get`, `entity_query`, `entity_search`, `entity_update`, ...) and orchestrate transactions (`txn_create`, `txn_activate`, `txn_cancel`).

For Cursor / Windsurf / other MCP-native IDEs the registration command differs but the endpoint shape is the same: HTTP MCP at `http://localhost:7777/mcp` with bearer token.

---

## Standalone (without docker-compose)

If you already have a Postgres + pgvector running, you can use this image directly:

```bash
docker run --rm -d \
  --name kvendra-platform \
  -p 7777:7777 \
  -v kvendra-platform-data:/data \
  -e DATABASE_URL='postgres://kvendra:kvendra@host.docker.internal:5432/kvendra_platform' \
  -e EMBEDDINGS_PROVIDER=openai-compatible \
  -e EMBEDDINGS_BASE_URL='https://api.kvendra.cloud/v1' \
  -e EMBEDDINGS_MODEL='kvendra-embedding-v1' \
  -e EMBEDDINGS_API_KEY='kvd_live_xxx' \
  kvendra/kvendra-platform:0.1.0-alpha.0

# Wait ~10s for migrations + boot, then:
curl http://localhost:7777/healthz
docker exec kvendra-platform cat /data/auth.token
```

The Postgres database must exist and have `CREATE EXTENSION IF NOT EXISTS vector;` enabled. The Platform runs schema migrations on boot via the entrypoint script.

---

## Build the image yourself (reproduce 100% from source)

For audit-grade environments (banks, regulated teams, security audits) or anyone who wants to compile every byte from public source rather than trust the published image, build locally and skip the pull:

```bash
# 1. Clone the source.
git clone https://github.com/KvendraAI/kvendra-platform
cd kvendra-platform

# 2. Build the image. Multi-stage: Node 20 Alpine base, ~3-5 min cold,
#    no network access needed beyond npm install + Alpine apk during build.
docker build -t kvendra-platform-local:0.1.0-alpha.0 .

# 3. (Optional) Inspect what you got — layers, env, entrypoint:
docker history kvendra-platform-local:0.1.0-alpha.0
docker inspect kvendra-platform-local:0.1.0-alpha.0

# 4. Use it in your compose file. In kvendra-reference-stack, the
#    helper script writes a docker-compose.override.yml for you:
cd /path/to/kvendra-reference-stack
./scripts/build-from-source.sh
# This clones kvendra-platform, builds the image, and writes an
# override that points docker-compose.yml at kvendra-platform-local
# instead of pulling kvendra/kvendra-platform from Docker Hub.

# Or wire it manually in your own compose file:
#   services:
#     kvendra-platform:
#       image: kvendra-platform-local:0.1.0-alpha.0
```

This path pulls **zero** Kvendra-built bits — only `node:20-alpine` from Docker Hub, and `apk` + `npm` packages from their public mirrors during the build. Combined with the upcoming cosign-Docker-Hub migration (see `ISSUE-KVD-REFERENCESTACK-E17E41`), a regulated user can independently reproduce the published digest if they want to verify supply-chain integrity end-to-end.

---

## Tags

| Tag | Purpose | Stability |
|---|---|---|
| `0.1.0-alpha.0` | M1 alpha skeleton (current) | alpha — APIs may evolve |
| `latest` | Mirror of the highest alpha/stable tag | tracks latest |

**M2 roadmap** (next): full 20 entity-type catalog + skills runtime server-side + MCP Streamable HTTP upgrade. Follow `kvendra-platform` GitHub for milestones.

---

## Verify the image

The project signs each released image with **cosign keyless-OIDC** via GitHub Actions (no key material to manage — the Fulcio cert proves the image was built by the `KvendraAI/kvendra-platform` GitHub Actions workflow). Releases also attach an SBOM (SPDX JSON) as a cosign attestation.

### Quick check — digest only

```bash
docker pull kvendra/kvendra-platform:0.1.0-alpha.0
docker inspect --format='{{.Id}}' kvendra/kvendra-platform:0.1.0-alpha.0
# alpha.0 (multi-arch, signed): sha256:10f76875aea6712ed6e5b36f0ae55fb6886ed1264f5a712ec138ac2e40448a69
```

### Full check — cosign signature + SBOM attestation (recommended)

Install [cosign](https://docs.sigstore.dev/system_config/installation/) (`brew install cosign` on macOS) and:

```bash
# Verify the image signature.
cosign verify docker.io/kvendra/kvendra-platform:<version> \
  --certificate-identity-regexp '^https://github.com/KvendraAI/kvendra-platform/' \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com

# Verify the SBOM attestation.
cosign verify-attestation docker.io/kvendra/kvendra-platform:<version> \
  --certificate-identity-regexp '^https://github.com/KvendraAI/kvendra-platform/' \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com \
  --type spdxjson
```

Both commands exit 0 with a JSON payload if the signature is valid. The matching SBOM is also attached as a GitHub Release asset at https://github.com/KvendraAI/kvendra-platform/releases/.

### Coverage

The signing workflow has covered every release from `v0.1.0-alpha.0` (the current published tag) onwards. `cosign verify` and `cosign verify-attestation` both succeed against the published image — try them yourself before running the container if your environment requires supply-chain verification before pulls.

---

## Troubleshooting

- **`pg_isready: connection refused`** — Postgres not booted yet. The reference-stack uses `depends_on.condition: service_healthy` to wait; standalone runs may need `--restart unless-stopped` plus a retry.
- **`embeddings auth failed (401)`** — `EMBEDDINGS_API_KEY` not set, expired, or pointing at a placeholder (`REPLACE_WITH_YOUR_KVENDRA_KEY`). Edit `.env` and `docker compose restart kvendra-platform`.
- **Out-of-memory at boot** — Node uses ~80-120 MB resident; if you're seeing OOM, check the Postgres container's `shared_buffers` (default may exceed Docker Desktop memory cap).
- **Schema migration loop** — `/data` volume corrupted. Drop the volume and restart: `docker volume rm kvendra_ref_platform_data`. WARNING: this destroys local KB state.

For more, see https://github.com/KvendraAI/kvendra-reference-stack/blob/main/docs/troubleshooting.md.

---

## Links

| | |
|---|---|
| **Source code** | https://github.com/KvendraAI/kvendra-platform |
| **Full stack (docker-compose)** | https://github.com/KvendraAI/kvendra-reference-stack |
| **Managed mode (free tier)** | https://kvendra.cloud |
| **Claude Code plugin** | https://github.com/KvendraAI/kvendra-skills |
| **Issue tracker** | https://github.com/KvendraAI/kvendra-platform/issues |
| **License** | AGPL-3.0 (compatible with self-hosting and commercial AGPL-respecting use) |

---

*Built with Node 20 Alpine + TypeScript + Fastify + PostgreSQL + pgvector. Threat model: single-tenant local — secrets stay on your host.*
