-- SPDX-License-Identifier: AGPL-3.0-only
-- kvendra-platform migration 0002 — entities table + 20-type enum.
--
-- The enum existence guard joins `pg_type` with `pg_namespace` and filters by
-- `current_schema` so it stays idempotent per-schema (not per-database). The
-- naive form `SELECT 1 FROM pg_type WHERE typname = 'entity_type_enum'` is
-- broken when this migration is replayed under a different `search_path`:
-- catalogs like `pg_type` are database-global, so the guard sees the type
-- created in *any* schema and skips, leaving the new schema without its own
-- enum. The subsequent `CREATE TABLE entities (... entity_type_enum ...)`
-- then fails with "type entity_type_enum does not exist". The
-- `current_schema` filter makes the guard semantically equivalent to the
-- native `CREATE TYPE IF NOT EXISTS` (PG 14+) that we'd use if it existed.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON t.typnamespace = n.oid
    WHERE t.typname = 'entity_type_enum'
      AND n.nspname = current_schema()
  ) THEN
    CREATE TYPE entity_type_enum AS ENUM (
      'PRJ','CMP','IF','REQ','TEST','REG','ISSUE','REL','SLA','ROAD',
      'GLO','STD','PAT','ADR','RUN','UX','DOC','ENV','COST','CFG'
    );
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS entities (
  entity_id      TEXT             PRIMARY KEY,
  entity_type    entity_type_enum NOT NULL,
  project_id     TEXT,
  component_id   TEXT,
  status         TEXT             NOT NULL DEFAULT 'active',
  archived       BOOLEAN          NOT NULL DEFAULT false,
  archived_at    TIMESTAMPTZ,
  archive_reason TEXT,
  title          TEXT             NOT NULL,
  content        TEXT             NOT NULL DEFAULT '',
  tags           TEXT[]           NOT NULL DEFAULT '{}'::TEXT[],
  metadata       JSONB            NOT NULL DEFAULT '{}'::JSONB,
  embedding      vector(1024),
  version        INTEGER          NOT NULL DEFAULT 1,
  txn_id         TEXT,
  created_at     TIMESTAMPTZ      NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ      NOT NULL DEFAULT now(),
  updated_by     TEXT             NOT NULL,

  CONSTRAINT entities_entity_id_format
    CHECK (entity_id ~ '^[A-Z]+(-[A-Z0-9]+)+(-[A-Z0-9._-]+)?$')
);
