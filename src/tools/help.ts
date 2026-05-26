/* SPDX-License-Identifier: AGPL-3.0-only */
import { helpInput } from '../domain/validation.js';
import type { ToolDescriptor, ToolDeps } from './index.js';

const PROTOCOL_VERSION = '1.1';

interface BootstrapQuery {
  step: number;
  tool: string;
  args?: Record<string, unknown>;
  purpose: string;
}

interface TopicEntry {
  content: string;
  see_also?: string[];
  queries?: BootstrapQuery[];
}

const PROJECT_BOOTSTRAP_QUERIES: BootstrapQuery[] = [
  { step: 1, tool: 'whoami', purpose: 'verify identity, tier and connection (returns identity_source: "oidc" in cloud or "local" in self-host)' },
  { step: 2, tool: 'entity_get', args: { entity_id: 'PRJ-<PROJECT>' }, purpose: 'load project metadata (bootstrap_extras, owner_handle, workspace_layout)' },
  { step: 3, tool: 'entity_get', args: { entity_id: '<each id from PRJ.metadata.bootstrap_extras>' }, purpose: 'load policies/standards declared as bootstrap prerequisites' },
  { step: 4, tool: 'txn_check_interrupted', args: { project_id: '<PROJECT>' }, purpose: 'detect orphan TXNs from prior sessions before opening new work' },
  { step: 5, tool: 'entity_query', args: { entity_type: 'ROAD', project_id: '<PROJECT>', tags_any: ['status:in-progress', 'status:active'] }, purpose: 'load active roadmaps' },
  { step: 6, tool: 'entity_query', args: { entity_type: 'REL', project_id: '<PROJECT>', order_by: 'updated_at_desc', limit: 5 }, purpose: 'recent releases for context' },
  { step: 7, tool: 'entity_query', args: { entity_type: 'ISSUE', project_id: '<PROJECT>', tags_any: ['status:open', 'status:in-progress'] }, purpose: 'active issues and in-progress work' },
];

const HELP_CONTENT: Record<string, TopicEntry> = {
  version: {
    content:
      `Kvendra Platform protocol v${PROTOCOL_VERSION} (M1 alpha skeleton). 14 MCP tools, 20 entity types, single-tenant self-host. Help topics now include project bootstrap, workspace layout conventions and skill playbook schema (see see_also).`,
    see_also: ['bootstrap', 'tools'],
  },
  bootstrap: {
    content:
      '# Project bootstrap protocol\n\nRun the queries below in order to load the project context for the current session. The protocol is invariant across Kvendra projects — CLAUDE.md only declares project_id + tier flag; everything else loads from the KB at session start.\n\nThis topic returns project-level bootstrap. For motor installation instructions see topic `install`.',
    see_also: ['identity', 'workspace-layout', 'txn', 'install'],
    queries: PROJECT_BOOTSTRAP_QUERIES,
  },
  install: {
    content:
      '# Motor install (self-host)\n\n1. `docker compose up` in the kvendra-platform repo. 2. Read `/data/auth.token`. 3. Configure your MCP-compatible client (Claude Code, etc.) with `Authorization: Bearer <token>`. 4. Create `CFG-<USER>` entity with `metadata.config.identity.email` set. 5. Create `PRJ-<PROJECT>` + first `CMP-<PROJECT>-<COMPONENT>` entities. 6. Open a TXN and start adding entities.',
    see_also: ['bootstrap', 'identity', 'tools'],
  },
  identity: {
    content:
      'Identity is transparent locally. `whoami` returns `mode:"local-uninit"` until you create a `CFG-<USER>` entity with `metadata.config.identity.email` set. In cloud mode (Enterprise proxy) the `user_id` is resolved from the JWT before reaching the engine; `identity_source: "oidc"`. In local self-host `identity_source: "local"` with values from `CFG-<USER>` or empty if uninit.',
    see_also: ['bootstrap'],
  },
  naming: {
    content:
      'PRJ-<PROY>, CMP-<PROY>-<COMP>, REL-<PROY>[-<COMP>]-<X.Y.Z[.W][-suffix]> require force_id. All other types are server-generated: <TYPE>-<PROY>[-<COMP>]-<6HEX>. CFG comes in three scopes: CFG-<USER>, CFG-<PROY>, CFG-<PROY>-<USER>. STD entities follow `STD-<PROY>-<COMP?>-<TOPIC>` (see topic `skill-playbooks`).',
    see_also: ['entity_types', 'skill-playbooks'],
  },
  txn: {
    content:
      'Open with `txn_create(project_id, type, trigger, started_by)`. Entities created with `txn_id` are drafts. Close with `txn_activate` (drafts → active per terminal status) or `txn_cancel` (drafts → cancelled). Use `txn_check_interrupted` to recover from prior interruptions — included as step 4 of the project bootstrap protocol.',
    see_also: ['bootstrap', 'errors', 'validation'],
  },
  validation: {
    content:
      'entity_create validates entity_type (enum of 20), entity_id format, relation types, and PRJ/CMP/REL force_id patterns. entity_update enforces optimistic locking by expected_version. PRJ.metadata and CMP.metadata convention fields (see topic `workspace-layout`) are accepted without warnings — convention-only, not schema-enforced.',
    see_also: ['errors', 'workspace-layout'],
  },
  errors: {
    content:
      'Errors include `{code, message, help: {topic}}` where topic points to a help entry. Common codes: ENTITY_NOT_FOUND, VERSION_CONFLICT, INVALID_ID, TXN_ACTIVATE_FAILED, EMBEDDING_FAILED.',
    see_also: ['validation'],
  },
  embeddings: {
    content:
      'M1 uses a deterministic mock provider (SHA-256 + ChaCha20 → 1024-dim L2-normalized). EMBEDDINGS_PROVIDER=mock is the default for self-host. BYOK providers (openai-compatible/ollama) ship in M2 (see REQ-KVD-PLATFORM-0147DC, done 2026-05-21).',
    see_also: ['tools'],
  },
  tools: {
    content:
      '14 MCP tools grouped: 5 CRUD (entity_get/create/update/archive/related), 2 search (entity_query/search), 4 TXN (txn_create/activate/cancel/check_interrupted), 3 utilities (whoami, config_get, help).',
    see_also: ['bootstrap', 'errors'],
  },
  examples: {
    content: 'See docs/mcp-tools.md for a per-tool schema reference with example requests and responses.',
    see_also: ['bootstrap', 'tools'],
  },
  entity_types: {
    content:
      '20 entity types: PRJ, CMP, IF, REQ, TEST, REG, ISSUE, REL, SLA, ROAD, GLO, STD, PAT, ADR, RUN, UX, DOC, ENV, COST, CFG. M1 ships first-class validation for PRJ, CMP, ISSUE, ADR, ROAD, REL; the remaining 14 are accepted with relaxed validation and formalized in M2. Metadata conventions for PRJ + CMP at topic `workspace-layout`; STD playbook conventions at topic `skill-playbooks`.',
    see_also: ['naming', 'txn', 'workspace-layout', 'skill-playbooks'],
  },
  'workspace-layout': {
    content:
      '# Workspace layout conventions\n\nPRJ.metadata conventions (declared at the engine level, available in both local self-host and cloud modes):\n- `bootstrap_extras: string[]` — list of entity IDs to load after PRJ during bootstrap (e.g. `["STD-<PROJECT>-DEPLOY-POLICY"]`). Consumed by step 3 of the project bootstrap protocol.\n- `owner_handle: string` — preferred_username of the project owner. Declarative by default; in cloud mode with identity verification (Track A) it is sourced from `whoami` identity claims.\n- `workspace_layout: "siblings" | "monorepo" | "mixed" | <string>` — physical layout of the project repositories on the developer machine.\n\nCMP.metadata conventions:\n- `workspace_subdir: string` — relative path from workspace_root to the component clone (e.g. `"kvendra-cli"`). Absolute paths are per-machine and do NOT belong in the KB.\n- `repo_url: string` — canonical Git remote of the component repo.\n\nValidation is convention-only — the server accepts these fields without warnings; missing fields fall back to declarative defaults. Skills `onboard-project`, `sync-claudemd` and `lint-claudemd` rely on this contract uniformly across modes.\n\nWhy: these conventions resolve the chicken-and-egg of bootstrap (the agent needs to know where each component repo lives without hard-coding paths in CLAUDE.md). The contract is declared here so cloud (Enterprise) and self-host (Platform) consume the same schema.',
    see_also: ['bootstrap', 'entity_types'],
  },
  'skill-playbooks': {
    content:
      '# Skill playbooks — STD entity convention\n\nSkills v2 read tech-specific recipes from STD entities at runtime instead of hard-coding them in `SKILL.md`. This extends the indirection-to-help principle (see PAT-KVD-2CBB6D L4-extended) to project-specific procedures.\n\nNaming convention:\n- `STD-<PROJECT>-<COMPONENT?>-<TOPIC>`\n- `<COMPONENT?>` is optional — omit for cross-component procedures (e.g. `STD-<PROJECT>-DEPLOY-POLICY`).\n- `<TOPIC>` canonical values: `DEPLOY-PROCESS`, `RELEASE-PROCESS`, `TEST-PROCESS`, `REGRESSION-SUITE`, `DOC-PUBLISH`, `INCIDENT-RESPONSE`, `DEPLOY-POLICY`. Extensible.\n\nContent shape (markdown sections):\n- `Purpose`, `Pre-conditions`, `Steps` (numbered with command + expected output + failure mode), `Post-conditions`, `Variables` (name/value/notes table), `Validation`, `Rollback`.\n\nMetadata fields (recommended):\n- `playbook_type`: deploy|release|test|regression|doc-publish|incident-response\n- `autonomous`: boolean (whether the skill can run all steps without confirmation)\n- `requires_confirmation`: string[] (step ids that need explicit user confirmation)\n- `vault_profile_required`: string|null (broker profile_id needed, if any)\n- `estimated_duration_minutes`: integer\n\nFail-safe: if the skill needs an STD that does not exist, it STOPS and asks the user to define it (no improvisation). See ADR-KVD-SKILLS-BB0E8A for the full schema and rationale.',
    see_also: ['bootstrap', 'workspace-layout', 'naming'],
  },
};

interface HelpResponse {
  topic: string;
  protocol_version: string;
  content: string;
  see_also?: string[];
  queries?: BootstrapQuery[];
}

export const helpTool: ToolDescriptor = {
  name: 'help',
  description: 'Living protocol documentation per topic. Pass topic from the enum.',
  inputSchema: helpInput,
  async handler(_deps: ToolDeps, raw: unknown): Promise<HelpResponse> {
    const input = helpInput.parse(raw);
    const entry = HELP_CONTENT[input.topic];
    if (!entry) {
      return {
        topic: input.topic,
        protocol_version: PROTOCOL_VERSION,
        content: `No help registered for topic "${input.topic}".`,
      };
    }
    const response: HelpResponse = {
      topic: input.topic,
      protocol_version: PROTOCOL_VERSION,
      content: entry.content,
    };
    if (entry.see_also) response.see_also = entry.see_also;
    if (entry.queries) response.queries = entry.queries;
    return response;
  },
};
