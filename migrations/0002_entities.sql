-- SPDX-License-Identifier: AGPL-3.0-only
-- kvendra-platform migration 0002 — entities table + 20-type enum.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'entity_type_enum') THEN
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
