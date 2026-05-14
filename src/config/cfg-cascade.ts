/* SPDX-License-Identifier: AGPL-3.0-only */
import type { EntityRepo } from '../storage/entity-repo.js';
import type { Entity } from '../domain/entity-types.js';

export interface CascadeResult {
  merged: Record<string, unknown>;
  sources: Array<{ scope: 'user' | 'project' | 'project-user'; entity_id: string }>;
}

/**
 * Merge `CFG-<USER>` → `CFG-<PROY>` → optional `CFG-<PROY>-<USER>` cascade.
 *
 * Each level overrides the same JSON keys of the previous. The CFG entity
 * stores its config payload in `metadata.config` (JSON). Missing levels are
 * skipped silently.
 */
export async function buildCfgCascade(
  repo: EntityRepo,
  userId: string,
  projectId?: string | null,
  includeProjectUser = false,
): Promise<CascadeResult> {
  const sources: CascadeResult['sources'] = [];
  let merged: Record<string, unknown> = {};

  const cfgUserId = `CFG-${userId.toUpperCase()}`;
  const userEntity = await repo.getById(cfgUserId, true, true);
  if (userEntity) {
    merged = deepMerge(merged, extractConfig(userEntity));
    sources.push({ scope: 'user', entity_id: userEntity.entity_id });
  }

  if (projectId) {
    const cfgProyId = `CFG-${projectId.toUpperCase()}`;
    const proyEntity = await repo.getById(cfgProyId, true, true);
    if (proyEntity) {
      merged = deepMerge(merged, extractConfig(proyEntity));
      sources.push({ scope: 'project', entity_id: proyEntity.entity_id });
    }

    if (includeProjectUser) {
      const cfgProyUserId = `CFG-${projectId.toUpperCase()}-${userId.toUpperCase()}`;
      const proyUserEntity = await repo.getById(cfgProyUserId, true, true);
      if (proyUserEntity) {
        merged = deepMerge(merged, extractConfig(proyUserEntity));
        sources.push({ scope: 'project-user', entity_id: proyUserEntity.entity_id });
      }
    }
  }

  return { merged, sources };
}

function extractConfig(entity: Entity): Record<string, unknown> {
  const meta = entity.metadata ?? {};
  const cfg = (meta as Record<string, unknown>).config;
  if (cfg && typeof cfg === 'object') return cfg as Record<string, unknown>;
  return {};
}

export function deepMerge(
  base: Record<string, unknown>,
  override: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(override)) {
    const existing = out[k];
    if (isPlainObject(existing) && isPlainObject(v)) {
      out[k] = deepMerge(existing, v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

function isPlainObject(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}
