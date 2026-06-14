/* SPDX-License-Identifier: AGPL-3.0-only */
import { z } from 'zod';
import { ENTITY_TYPES, RELATION_TYPES } from './entity-types.js';

export const entityTypeSchema = z.enum(ENTITY_TYPES);
export const relationTypeSchema = z.enum(RELATION_TYPES);

export const relationSchema = z.object({
  type: relationTypeSchema,
  target: z.string().min(1),
});

export const createEntityInput = z.object({
  entity_type: entityTypeSchema,
  entity_id: z.string().optional(),
  // INTERFACE PARITY (IF-060D2B): Enterprise-shaped callers send `force_id`
  // as the literal-id alias. Accept both; the handler resolves whichever wins.
  force_id: z.string().optional(),
  project_id: z.string().optional(),
  component_id: z.string().optional(),
  title: z.string().min(1),
  content: z.string().default(''),
  tags: z.array(z.string()).optional(),
  metadata: z.record(z.unknown()).optional(),
  relations: z.array(relationSchema).optional(),
  status: z.string().optional(),
  txn_id: z.string().optional(),
  generate_embedding: z.boolean().optional(),
});

/**
 * entity_update — INTERFACE PARITY with IF-060D2B (Enterprise-shaped skills).
 *
 * Platform's legacy shape used a nested `patch{}` + REQUIRED `expected_version`.
 * Enterprise-shaped skills (kvendra-skills 1.7.0) send a FLAT call with
 * top-level title/content/status/metadata/tags, tag deltas (tags_add/remove/set),
 * relation deltas, archive fields, and a `trigger`. This schema accepts BOTH:
 *   - `patch{}` is kept as a back-compat alias (optional).
 *   - flat top-level fields are accepted in addition (handler merges; flat wins).
 *   - `expected_version` is optional → present means CAS check, absent means
 *     lenient last-write-wins (AC-CAS-KEEP-1). No VERSION_REQUIRED enforcement.
 * This is interface parity, NOT capability parity (single-tenant Platform).
 */
export const updateEntityInput = z.object({
  entity_id: z.string().min(1),
  // Optional → CAS check only when present (AC-CAS-KEEP-1, back-compat).
  expected_version: z.number().int().positive().optional(),
  // Back-compat nested alias. Still optional, still accepted.
  patch: z
    .object({
      title: z.string().optional(),
      content: z.string().optional(),
      tags: z.array(z.string()).optional(),
      metadata: z.record(z.unknown()).optional(),
      status: z.string().optional(),
    })
    .optional(),
  // Flat top-level fields (Enterprise shape). Merge with patch{}, flat wins.
  title: z.string().optional(),
  content: z.string().optional(),
  status: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
  tags: z.array(z.string()).optional(),
  // Tag deltas (Class 1 — write intent; read-modify-write in the handler).
  tags_add: z.array(z.string()).optional(),
  tags_remove: z.array(z.string()).optional(),
  tags_set: z.array(z.string()).optional(),
  // Relation deltas (Class 1 — wired to RelationsRepo in the handler).
  relations_add: z.array(relationSchema).optional(),
  relations_remove: z.array(relationSchema).optional(),
  relations_set: z.array(relationSchema).optional(),
  // Archive via update (Class 1 — routed to the archive path when true).
  archived: z.boolean().optional(),
  archive_reason: z.string().optional(),
  // Provenance (Class 2 — accepted and IGNORED; Platform uses txn-vs-direct).
  trigger: z.string().optional(),
  change_summary: z.string().min(1),
  txn_id: z.string().optional(),
});

export const archiveEntityInput = z.object({
  entity_id: z.string().min(1),
  // INTERFACE PARITY: Enterprise callers may omit the reason. Optional.
  archive_reason: z.string().optional(),
});

export const getEntityInput = z.object({
  entity_id: z.string().min(1),
  include_drafts: z.boolean().optional(),
  include_archived: z.boolean().optional(),
  include_related: z.boolean().optional(),
  related_limit: z.number().int().min(1).max(20).optional(),
});

export const relatedInput = z.object({
  entity_id: z.string().min(1),
  limit: z.number().int().min(1).max(20).optional(),
  min_score: z.number().min(0).max(1).optional(),
  entity_type: entityTypeSchema.optional(),
  cross_projects: z.boolean().optional(),
  // INTERFACE PARITY (Class 2 — accepted and IGNORED): Enterprise does
  // graph-walk depth; Platform does similarity, not graph traversal.
  depth: z.number().int().optional(),
});

export const queryInput = z.object({
  entity_type: entityTypeSchema.optional(),
  project_id: z.string().optional(),
  component_id: z.string().optional(),
  status: z.union([z.string(), z.array(z.string())]).optional(),
  tags_all: z.array(z.string()).optional(),
  tags_any: z.array(z.string()).optional(),
  drafts: z.boolean().optional(),
  archived: z.boolean().optional(),
  limit: z.number().int().min(1).max(100).optional(),
  offset: z.number().int().min(0).optional(),
  order_by: z.enum(['updated_at_desc', 'entity_id_asc']).optional(),
});

export const searchInput = z.object({
  query: z.string().min(3),
  entity_type: entityTypeSchema.optional(),
  project_id: z.string().optional(),
  tags_all: z.array(z.string()).optional(),
  limit: z.number().int().min(1).max(20).optional(),
  min_score: z.number().min(0).max(1).optional(),
  include_archived: z.boolean().optional(),
});

export const txnCreateInput = z.object({
  project_id: z.string().min(1),
  component_id: z.string().optional(),
  type: z.string().min(1),
  trigger: z.string().optional(),
  pipeline: z.array(z.object({ step: z.number(), name: z.string() })).optional(),
  started_by: z.string().min(1),
  force_id: z.string().optional(),
});

export const txnActivateInput = z.object({
  txn_id: z.string().min(1),
  // INTERFACE PARITY: optional; handler defaults to local identity / system.
  activated_by: z.string().min(1).optional(),
});

export const txnCancelInput = z.object({
  txn_id: z.string().min(1),
  reason: z.string().min(1),
  // INTERFACE PARITY: optional; handler defaults to local identity / system.
  cancelled_by: z.string().min(1).optional(),
});

export const txnCheckInterruptedInput = z.object({
  project_id: z.string().min(1),
  component_id: z.string().optional(),
});

export const whoamiInput = z.object({}).strict();

export const configGetInput = z.object({
  // INTERFACE PARITY: optional; handler defaults from local identity (whoami).
  user_id: z.string().min(1).optional(),
  project_id: z.string().optional(),
  project_user: z.boolean().optional(),
});

export const helpInput = z.object({
  topic: z.enum([
    'bootstrap',
    'identity',
    'naming',
    'txn',
    'validation',
    'errors',
    'embeddings',
    'tools',
    'examples',
    'entity_types',
    'version',
    'install',
    'workspace-layout',
    'skill-playbooks',
    'broker-policy',
  ]),
});
