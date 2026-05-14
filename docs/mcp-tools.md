<!-- SPDX-License-Identifier: AGPL-3.0-only -->
# Kvendra Platform — MCP tool reference

This document describes the 14 MCP tools served by `kvendra-platform` at
`POST /mcp` over JSON-RPC 2.0. Tool input/output schemas are also published
through `tools/list`.

## Transport

```
POST /mcp
Authorization: Bearer <token from /data/auth.token>
Content-Type: application/json

{ "jsonrpc": "2.0", "id": 1, "method": "tools/call",
  "params": { "name": "<tool>", "arguments": { ... } } }
```

Responses are JSON-RPC `result` envelopes. Tool-level errors come back inside
`result.content[0].text` with `result.isError = true` and a JSON payload
`{ code, message, help?: { topic } }`.

## CRUD entities

### `entity_get`

| Field | Required | Default |
|---|---|---|
| `entity_id` | yes | — |
| `include_drafts` | no | `false` |
| `include_archived` | no | `false` |
| `include_related` | no | `false` |
| `related_limit` | no, ≤20 | `10` |

Returns `{ entity, tags, relations_outbound, relations_inbound, history, related? }`.

### `entity_create`

| Field | Required | Notes |
|---|---|---|
| `entity_type` | yes | One of the 20 canonical types. |
| `force_id` | required for PRJ/CMP/REL | Otherwise optional. |
| `project_id` | depends on type | Server-generated IDs use it as prefix. |
| `component_id` | optional | |
| `title` | yes | |
| `content` | no | defaults to `""` |
| `tags` | no | |
| `metadata` | no | |
| `relations` | no | Array of `{type, target}`. |
| `status` | no | When `txn_id` is set, defaults to `draft`. |
| `txn_id` | no | Associates the entity with a transaction. |
| `generate_embedding` | no | Defaults to `true` (false for `CFG`). |

Returns `{ entity_id, status, version }`.

### `entity_update`

`{ entity_id, expected_version, patch: { title?, content?, tags?, metadata?, status? }, change_summary, txn_id? }`
→ `{ entity_id, version, history_id }`.

Optimistic locking by `expected_version`. Mismatch returns `VERSION_CONFLICT`.

### `entity_archive`

`{ entity_id, archive_reason }` → `{ entity_id, archived_at }`.

### `entity_related`

`{ entity_id, limit?, min_score?=0.5, entity_type? }` → `{ related: [{ entity_id, score, title }] }`.

## Search

### `entity_query`

Boolean filter, no embedding. Fields: `entity_type`, `project_id`, `component_id`,
`status` (string or array), `tags_all` (AND), `tags_any` (OR), `drafts=false`,
`archived=false`, `limit≤100=50`, `offset=0`, `order_by` (`updated_at_desc` default
or `entity_id_asc`).

### `entity_search`

`{ query (≥3 chars), entity_type?, project_id?, tags_all?, limit≤20=10, min_score=0.4, include_archived=false }`
→ `{ results: [{ entity_id, score, title, snippet }] }`. Cosine similarity.

## Transactions

### `txn_create`

`{ project_id, component_id?, type, trigger?, pipeline?, started_by, force_id? }`
→ `{ txn_id, started_at }`.

### `txn_activate`

`{ txn_id, activated_by }` → `{ txn_id, completed_at, promoted_entities }`.

### `txn_cancel`

`{ txn_id, reason, cancelled_by }` → `{ txn_id, cancelled_at }`.

### `txn_check_interrupted`

`{ project_id, component_id? }` → `{ interrupted: [Txn, ...] }`.

## Utilities

### `whoami`

`{}` → `{ user_id, email|null, mode: "local" | "local-uninit" }`.

The engine inspects CFG entities. Returns `local-uninit` until you create a
`CFG-<USER>` entity whose `metadata.config.identity.email` is set.

### `config_get`

`{ user_id, project_id?, project_user?=false }` → `{ merged, sources }`.

Merges `CFG-<USER>` → `CFG-<PROY>` → optional `CFG-<PROY>-<USER>`. Each level
overrides the previous.

### `help`

`{ topic }` → `{ topic, content }` where topic is one of:
`bootstrap | identity | naming | txn | validation | errors | embeddings | tools | examples | entity_types | version`.

## Errors

Errors include a stable `code` and an optional `help.topic`:

| Code | Topic | Meaning |
|---|---|---|
| `ENTITY_NOT_FOUND` | `errors` | Lookup returned no row (filtered or absent). |
| `INVALID_ID` | `naming` | force_id rejected by validation. |
| `VERSION_CONFLICT` | `validation` | Optimistic lock failed on `entity_update`. |
| `TXN_ACTIVATE_FAILED` | `txn` | Transaction not in-progress. |
| `TXN_CANCEL_FAILED` | `txn` | Transaction not in-progress. |
| `EMBEDDING_FAILED` | `embeddings` | Provider error during embed. |
| `TOOL_NOT_FOUND` | `tools` | Unknown tool name. |
| `INVALID_PARAMS` | `errors` | Missing required JSON-RPC params. |
| `INTERNAL_ERROR` | — | Unhandled error. |
