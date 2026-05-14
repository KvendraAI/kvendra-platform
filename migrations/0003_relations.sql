-- SPDX-License-Identifier: AGPL-3.0-only
-- kvendra-platform migration 0003 — entity_relations.

CREATE TABLE IF NOT EXISTS entity_relations (
  source_entity_id TEXT NOT NULL REFERENCES entities(entity_id) ON DELETE CASCADE,
  target_entity_id TEXT NOT NULL REFERENCES entities(entity_id) ON DELETE CASCADE,
  relation_type    TEXT NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (source_entity_id, target_entity_id, relation_type),
  CONSTRAINT entity_relations_type_check
    CHECK (relation_type IN (
      'implements','fulfills','derives_from','affects','requires','mitigates',
      'fixes','blocks','decided_by','depends_on','consumes','enables',
      'respects','part_of'
    ))
);
