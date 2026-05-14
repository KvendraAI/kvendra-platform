/* SPDX-License-Identifier: AGPL-3.0-only */
import type { EntityType } from './entity-types.js';
import { FORCE_ID_TYPES } from './entity-types.js';
import { generateEntityId, parseEntityId } from '../utils/ids-generator.js';

const PRJ_REGEX = /^PRJ-[A-Z0-9]+$/;
const CMP_REGEX = /^CMP-[A-Z0-9]+-[A-Z0-9]+$/;
const REL_REGEX_DEFAULT =
  /^REL-[A-Z0-9]+(?:-[A-Z0-9]+)?-\d+\.\d+\.\d+(?:\.\d+)?(?:-[A-Za-z0-9.-]+)?$/;

export interface IdValidationError {
  ok: false;
  reason: string;
  help_topic: 'naming';
}

export interface IdValidationOk {
  ok: true;
}

export type IdValidation = IdValidationOk | IdValidationError;

/**
 * Validate a force_id for PRJ / CMP / REL according to canonical patterns.
 * REL accepts an override regex (compiled from CFG-<PROY>.naming.semver_regex).
 */
export function validateForceId(
  entityType: EntityType,
  forceId: string,
  options?: { semverRegex?: string | null },
): IdValidation {
  switch (entityType) {
    case 'PRJ':
      if (!PRJ_REGEX.test(forceId)) {
        return {
          ok: false,
          reason: `PRJ entity_id must match ${PRJ_REGEX} (e.g. PRJ-KVD). Got "${forceId}".`,
          help_topic: 'naming',
        };
      }
      return { ok: true };
    case 'CMP':
      if (!CMP_REGEX.test(forceId)) {
        return {
          ok: false,
          reason: `CMP entity_id must match ${CMP_REGEX} (e.g. CMP-KVD-PLATFORM). Got "${forceId}".`,
          help_topic: 'naming',
        };
      }
      return { ok: true };
    case 'REL': {
      const regex = options?.semverRegex ? safeCompile(options.semverRegex) : REL_REGEX_DEFAULT;
      if (!regex) {
        return {
          ok: false,
          reason: `Invalid CFG semver_regex override for REL — could not compile.`,
          help_topic: 'naming',
        };
      }
      if (!regex.test(forceId)) {
        return {
          ok: false,
          reason: `REL entity_id "${forceId}" does not match the configured SemVer regex ${regex}.`,
          help_topic: 'naming',
        };
      }
      return { ok: true };
    }
    default:
      return { ok: true };
  }
}

function safeCompile(pattern: string): RegExp | null {
  try {
    return new RegExp(pattern);
  } catch {
    return null;
  }
}

/**
 * Derive (or validate) an entity_id for a create operation.
 * - For PRJ/CMP/REL: force_id is mandatory and validated.
 * - For all others: if force_id provided, accept it after a relaxed shape
 *   check; otherwise generate one.
 */
export function resolveEntityId(
  entityType: EntityType,
  forceId: string | undefined,
  projectId: string | null | undefined,
  componentId: string | null | undefined,
  options?: { semverRegex?: string | null },
): { entityId: string } | IdValidationError {
  if (FORCE_ID_TYPES.has(entityType)) {
    if (!forceId) {
      return {
        ok: false,
        reason: `${entityType} requires force_id (e.g. ${entityType}-${(projectId ?? 'PROY').toUpperCase()}).`,
        help_topic: 'naming',
      };
    }
    const v = validateForceId(entityType, forceId, options);
    if (!v.ok) return v;
    return { entityId: forceId };
  }

  if (forceId) {
    if (!/^[A-Z]+(-[A-Z0-9]+)+(-[A-Z0-9._-]+)?$/.test(forceId)) {
      return {
        ok: false,
        reason: `force_id "${forceId}" does not match the canonical entity_id pattern.`,
        help_topic: 'naming',
      };
    }
    return { entityId: forceId };
  }

  return { entityId: generateEntityId(entityType, projectId, componentId) };
}

export { parseEntityId };
