/* SPDX-License-Identifier: AGPL-3.0-only */
import { randomBytes } from 'node:crypto';

/**
 * Generate a server-side entity id following Kvendra v1.0 naming.
 *
 * Format:
 *   <TYPE>-<PROY>[-<COMP>]-<RANDOM6HEX>
 *
 * The PROY part is required for non-CFG-USER entities. Component is optional.
 *
 * The 6-hex random suffix is sufficient for M1 (collision probability is
 * negligible at the scale of a single-tenant local instance). M2 will revisit
 * with a deterministic MAX+1 scheme per (project, component, entity_type).
 */
export function generateEntityId(
  entityType: string,
  projectId: string | null | undefined,
  componentId: string | null | undefined,
): string {
  const suffix = randomBytes(3).toString('hex').toUpperCase();
  const parts: string[] = [entityType.toUpperCase()];
  if (projectId) parts.push(projectId.toUpperCase());
  if (componentId) {
    // component_id is conventionally `<PROY>-<COMP>`. Strip the redundant proy prefix
    // so we don't end up with `ISSUE-KVD-KVD-PLATFORM-XXXXXX`.
    let comp = componentId.toUpperCase();
    if (projectId && comp.startsWith(`${projectId.toUpperCase()}-`)) {
      comp = comp.slice(projectId.length + 1);
    }
    parts.push(comp);
  }
  parts.push(suffix);
  return parts.join('-');
}

/**
 * Parse an entity_id into its constituent parts. Returns null if it does not
 * match the canonical pattern.
 */
export function parseEntityId(entityId: string): {
  entityType: string;
  projectId: string | null;
  componentId: string | null;
  suffix: string;
} | null {
  // Pattern: TYPE-PROY[-COMP]-SUFFIX (suffix may be hex or semver-ish).
  const match = entityId.match(/^([A-Z]+)-([A-Z0-9]+)(?:-(.+))?$/);
  if (!match) return null;
  const entityType = match[1] ?? '';
  const projectId = match[2] ?? null;
  const rest = match[3];
  if (!rest) return { entityType, projectId, componentId: null, suffix: '' };
  // Split on the last dash: everything before is component, after is suffix.
  const lastDash = rest.lastIndexOf('-');
  if (lastDash === -1) {
    return { entityType, projectId, componentId: null, suffix: rest };
  }
  return {
    entityType,
    projectId,
    componentId: rest.slice(0, lastDash),
    suffix: rest.slice(lastDash + 1),
  };
}
