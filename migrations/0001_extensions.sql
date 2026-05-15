-- SPDX-License-Identifier: AGPL-3.0-only
-- kvendra-platform migration 0001 — required PostgreSQL extensions.
--
-- `WITH SCHEMA public` is harmless single-schema (where it's the default) but
-- critical for any consumer that applies these migrations under a non-public
-- `search_path` (e.g. multi-tenant wrappers running schema-per-tenant). Without
-- it, the extension's types/functions land in the first schema of the active
-- search_path on first install; subsequent `CREATE EXTENSION IF NOT EXISTS`
-- calls become no-ops (extensions are per-database), and a later
-- `CREATE TABLE ... embedding vector(1024)` from a different schema fails with
-- "type vector does not exist". Pinning to `public` keeps the extension
-- objects globally resolvable via search_path fallback.

CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version    TEXT        PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
