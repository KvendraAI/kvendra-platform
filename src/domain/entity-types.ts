/* SPDX-License-Identifier: AGPL-3.0-only */

export const ENTITY_TYPES = [
  'PRJ', 'CMP', 'IF', 'REQ', 'TEST', 'REG', 'ISSUE', 'REL', 'SLA', 'ROAD',
  'GLO', 'STD', 'PAT', 'ADR', 'RUN', 'UX', 'DOC', 'ENV', 'COST', 'CFG',
] as const;

export type EntityType = (typeof ENTITY_TYPES)[number];

export const RELATION_TYPES = [
  'implements', 'fulfills', 'derives_from', 'affects', 'requires', 'mitigates',
  'fixes', 'blocks', 'decided_by', 'depends_on', 'consumes', 'enables',
  'respects', 'part_of',
] as const;

export type RelationType = (typeof RELATION_TYPES)[number];

export interface Relation {
  type: RelationType;
  target: string;
}

export interface Entity {
  entity_id: string;
  entity_type: EntityType;
  project_id: string | null;
  component_id: string | null;
  status: string;
  archived: boolean;
  archived_at: string | null;
  archive_reason: string | null;
  title: string;
  content: string;
  tags: string[];
  metadata: Record<string, unknown>;
  version: number;
  txn_id: string | null;
  created_at: string;
  updated_at: string;
  updated_by: string;
}

export interface Transaction {
  txn_id: string;
  status: 'in-progress' | 'completed' | 'cancelled';
  type: string;
  trigger: string | null;
  project_id: string;
  component_id: string | null;
  pipeline: Array<{ step: number; name: string }>;
  started_by: string;
  started_at: string;
  completed_at: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  recovery_notes: string | null;
}

export interface HistoryEntry {
  id: string;
  entity_id: string;
  fecha: string;
  autor: string;
  trigger: string | null;
  change_summary: string;
  version_before: number | null;
  version_after: number;
  created_at: string;
}

/**
 * 6 entity types fully validated end-to-end in M1 (per REQ-KVD-PLATFORM-001
 * + IF amendment 2026-05-14 adding REL). The remaining 14 types are accepted
 * with basic validation but no entity-specific schema (M2 will formalize).
 */
export const M1_FIRST_CLASS_TYPES: ReadonlySet<EntityType> = new Set([
  'PRJ', 'CMP', 'ISSUE', 'ADR', 'ROAD', 'REL',
]);

/** Entity types that MUST be created with force_id (server cannot autogenerate). */
export const FORCE_ID_TYPES: ReadonlySet<EntityType> = new Set(['PRJ', 'CMP', 'REL']);
