# kvendra-platform

**Single-tenant KB engine. Typed entities, transactional changelog, MCP server over Streamable HTTP.**

Kvendra Platform is the open-source structural core of the Kvendra product line. It runs as a self-hosted process (or Docker container) on your machine and exposes 20 typed entity types (`PRJ`, `CMP`, `IF`, `REQ`, `TEST`, `REG`, `ISSUE`, `REL`, `SLA`, `ROAD`, `GLO`, `STD`, `PAT`, `ADR`, `RUN`, `UX`, `DOC`, `ENV`, `COST`, `CFG`) through 14 MCP tools that any AI assistant (Claude Code, custom agents, etc.) can call.

This repository tracks **M1 alpha skeleton** (single-tenant, mock embeddings, docker-compose self-host). Multi-tenancy, RBAC, OIDC and managed embeddings live in `kvendra-enterprise` (proprietary), per `ADR-KVD-023`.

## Status

`0.1.0-alpha.0` — M1 skeleton in progress (per `ROAD-KVD-011`).

## Install (Docker Compose self-host)

```bash
git clone https://github.com/KvendraAI/kvendra-platform
cd kvendra-platform
docker compose up -d

# Wait ~20s for PostgreSQL + pgvector + platform to boot. Then:
curl http://localhost:7777/healthz
# {"status":"ok","schema_version":"v1.0"}

# Auth token is bootstrapped in ./data/auth.token (mode 0600).
cat ./data/auth.token
```

## Configure Claude Code

Add an MCP server entry in your Claude Code settings (`~/.claude/settings.json` or project `.mcp.json`):

```json
{
  "mcpServers": {
    "kvendra-platform": {
      "type": "http",
      "url": "http://localhost:7777/mcp",
      "headers": {
        "Authorization": "Bearer <paste-token-from-./data/auth.token>"
      }
    }
  }
}
```

Restart Claude Code. The 14 `kvendra-platform__*` tools become available.

## MCP tools (14)

| Group | Tool | Purpose |
|---|---|---|
| CRUD | `entity_get` | Lookup by `entity_id` (optionally with relations / history) |
| CRUD | `entity_create` | Create a typed entity (auto-id, schema-validated, optional embedding) |
| CRUD | `entity_update` | Optimistic-locked update with `change_summary` |
| CRUD | `entity_archive` | Soft-archive (reversible) |
| CRUD | `entity_related` | Semantically nearest entities |
| Search | `entity_query` | Boolean filter over `entity_type`, `project_id`, `tags`, ... |
| Search | `entity_search` | Cosine similarity over content embedding |
| TXN | `txn_create` | Open a transaction grouping drafts |
| TXN | `txn_activate` | Promote drafts to `active` + complete TXN |
| TXN | `txn_cancel` | Abort TXN (drafts → cancelled) |
| TXN | `txn_check_interrupted` | List `in-progress` TXNs for a project/component |
| Utilities | `whoami` | Local: `{user_id, email, mode: "local" \| "local-uninit"}` |
| Utilities | `config_get` | Cascade `CFG-<USER>` → `CFG-<PROY>` → `CFG-<PROY>-<USER>` |
| Utilities | `help` | Living protocol docs by topic (`bootstrap`, `naming`, `txn`, ...) |

Tool input/output schemas live in [`docs/mcp-tools.md`](./docs/mcp-tools.md).

## Configure embeddings provider

`kvendra-platform` resolves the embeddings provider at startup from the
`EMBEDDINGS_PROVIDER` env var.

```bash
# Default (docker-compose): mock provider — deterministic, wire-stable, CI/demo only.
EMBEDDINGS_PROVIDER=mock

# Self-host with local Ollama (Tier B — 100% offline, BYO model quality):
EMBEDDINGS_PROVIDER=openai-compatible
EMBEDDINGS_BASE_URL=http://localhost:11434/v1
EMBEDDINGS_MODEL=mxbai-embed-large

# Self-host aligned with Kvendra Cloud SaaS (Tier A — no quality drift):
EMBEDDINGS_PROVIDER=openai-compatible
EMBEDDINGS_BASE_URL=https://api.kvendra.com/v1
EMBEDDINGS_MODEL=kvendra-embedding-v1
EMBEDDINGS_API_KEY=<your-key-from-app.kvendra.cloud>
```

Vectors are validated as 1024-dim and L2-normalized. Models with other dims
(e.g. `nomic-embed-text` → 768) fail at request time. See [`docs/embeddings.md`](./docs/embeddings.md)
for the full configuration matrix, supported providers, and the Tier A/B/C model.

## License (AGPL-3.0 — §13 implications)

Source code in this repository is licensed under [GNU AGPL-3.0-only](./LICENSE).

**Section 13 in plain English:** if you modify `kvendra-platform` and offer the modified version as a network-accessible service to third parties (e.g. hosting it publicly at `https://kb.your-company.com`), you must publish your modifications under AGPL-3.0 and make them available to those users. Using `kvendra-platform` internally (your own team, your own laptop, your own CI runners) does NOT trigger §13.

The companion product `kvendra-enterprise` is a separate proprietary codebase (multi-tenant SaaS, RBAC, OIDC, managed embeddings) owned by the same legal entity. It is NOT governed by AGPL-3.0. See `ADR-KVD-004` (Open Core licensing).

---

- Site: [kvendra.com](https://kvendra.com)
- Org: [github.com/KvendraAI](https://github.com/KvendraAI)
- Contact: hello@kvendra.ai
