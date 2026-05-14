-- SPDX-License-Identifier: AGPL-3.0-only
-- kvendra-platform migration 0007 — relax entity_id format CHECK to allow
-- lowercase in the SemVer pre-release suffix (e.g. REL-X-0.1.0-alpha.1).
--
-- Background: migration 0002 used '^[A-Z]+(-[A-Z0-9]+)+(-[A-Z0-9._-]+)?$' for
-- the trailing segment, which forbids the lowercase characters allowed by
-- DEFAULT_SEMVER_SUFFIX_REGEX in src/domain/semver.ts ([A-Za-z0-9.-]).
-- This caused valid pre-release REL ids (e.g. ...-alpha.1, ...-beta.2,
-- ...-rc.1) to be rejected by the DB CHECK before reaching the domain.
-- AC-PLAT-8 / ADR-KVD-PLATFORM-004.

ALTER TABLE entities DROP CONSTRAINT IF EXISTS entities_entity_id_format;
ALTER TABLE entities ADD CONSTRAINT entities_entity_id_format
  CHECK (entity_id ~ '^[A-Z]+(-[A-Z0-9]+)+(-[A-Za-z0-9._-]+)?$');
