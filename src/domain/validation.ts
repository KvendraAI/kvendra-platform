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

export const updateEntityInput = z.object({
  entity_id: z.string().min(1),
  expected_version: z.number().int().positive(),
  patch: z.object({
    title: z.string().optional(),
    content: z.string().optional(),
    tags: z.array(z.string()).optional(),
    metadata: z.record(z.unknown()).optional(),
    status: z.string().optional(),
  }),
  change_summary: z.string().min(1),
  txn_id: z.string().optional(),
});

export const archiveEntityInput = z.object({
  entity_id: z.string().min(1),
  archive_reason: z.string().min(1),
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
  activated_by: z.string().min(1),
});

export const txnCancelInput = z.object({
  txn_id: z.string().min(1),
  reason: z.string().min(1),
  cancelled_by: z.string().min(1),
});

export const txnCheckInterruptedInput = z.object({
  project_id: z.string().min(1),
  component_id: z.string().optional(),
});

export const whoamiInput = z.object({}).strict();

export const configGetInput = z.object({
  user_id: z.string().min(1),
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
