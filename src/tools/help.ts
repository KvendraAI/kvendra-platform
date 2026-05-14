/* SPDX-License-Identifier: AGPL-3.0-only */
import { helpInput } from '../domain/validation.js';
import type { ToolDescriptor, ToolDeps } from './index.js';

const HELP_CONTENT: Record<string, string> = {
  version:
    'Kvendra Platform protocol v1.0 (M1 alpha skeleton). 14 MCP tools, 20 entity types, single-tenant self-host.',
  bootstrap:
    'Boot order: 1) docker compose up. 2) Read /data/auth.token. 3) Configure Claude Code with Bearer header. 4) Create CFG-<USER>. 5) Create PRJ + CMP. 6) Open TXN and start adding entities.',
  identity:
    'Identity is transparent locally. whoami returns mode:"local-uninit" until you create a CFG-<USER> entity with metadata.config.identity.email set. In cloud mode (Enterprise proxy) the user_id is resolved from the JWT before reaching the engine.',
  naming:
    'PRJ-<PROY>, CMP-<PROY>-<COMP>, REL-<PROY>[-<COMP>]-<X.Y.Z[.W][-suffix]> require force_id. All other types are server-generated: <TYPE>-<PROY>[-<COMP>]-<6HEX>. CFG comes in three scopes: CFG-<USER>, CFG-<PROY>, CFG-<PROY>-<USER>.',
  txn:
    'Open with txn_create(project_id, type, trigger, started_by). Entities created with txn_id are drafts. Close with txn_activate (drafts → active) or txn_cancel (drafts → cancelled). Use txn_check_interrupted to recover from prior interruptions.',
  validation:
    'entity_create validates entity_type (enum of 20), entity_id format, relation types, and PRJ/CMP/REL force_id patterns. entity_update enforces optimistic locking by expected_version.',
  errors:
    'Errors include {code, message, help: {topic}} where topic points to a help entry. Common codes: ENTITY_NOT_FOUND, VERSION_CONFLICT, INVALID_ID, TXN_ACTIVATE_FAILED, EMBEDDING_FAILED.',
  embeddings:
    'M1 uses a deterministic mock provider (SHA-256 + ChaCha20 → 1024-dim L2-normalized). EMBEDDINGS_PROVIDER=mock is the only supported value. BYOK providers (bedrock/openai/ollama/http) ship in M2.',
  tools:
    '14 MCP tools grouped: 5 CRUD (entity_get/create/update/archive/related), 2 search (entity_query/search), 4 TXN (txn_create/activate/cancel/check_interrupted), 3 utilities (whoami, config_get, help).',
  examples:
    'See docs/mcp-tools.md for a per-tool schema reference with example requests and responses.',
  entity_types:
    '20 entity types: PRJ, CMP, IF, REQ, TEST, REG, ISSUE, REL, SLA, ROAD, GLO, STD, PAT, ADR, RUN, UX, DOC, ENV, COST, CFG. M1 ships first-class validation for PRJ, CMP, ISSUE, ADR, ROAD, REL; the remaining 14 are accepted with relaxed validation and formalized in M2.',
};

export const helpTool: ToolDescriptor = {
  name: 'help',
  description: 'Living protocol documentation per topic. Pass topic from the enum.',
  inputSchema: helpInput,
  async handler(_deps: ToolDeps, raw: unknown) {
    const input = helpInput.parse(raw);
    return {
      topic: input.topic,
      content: HELP_CONTENT[input.topic] ?? `No help registered for topic "${input.topic}".`,
    };
  },
};
