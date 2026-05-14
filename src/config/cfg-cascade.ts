/* SPDX-License-Identifier: AGPL-3.0-only */
import type { EntityRepo } from '../storage/entity-repo.js';
import type { Entity } from '../domain/entity-types.js';

export interface CascadeResult {
  merged: Record<string, unknown>;
  sources: Array<{ scope: 'user' | 'project' | 'project-user'; entity_id: string }>;
}

/**
 * Merge `CFG user` → `CFG project` → optional `CFG project-user` cascade.
 *
 * Each level overrides the same JSON keys of the previous. The CFG entity
 * stores its config payload in `metadata.config` (JSON). Missing levels are
 * skipped silently.
 *
 * Lookup strategy (ISSUE-KVD-PLATFORM-006): match CFG entities by
 * `metadata.scope` + `metadata.user_id` / `metadata.project_id`. A legacy
 * fallback to id-pattern (`CFG-<USER>` / `CFG-<PROJECT>` /
 * `CFG-<PROJECT>-<USER>`) is kept for compat with pre-fix CFG rows.
 */
export async function buildCfgCascade(
  repo: EntityRepo,
  userId: string,
  projectId?: string | null,
  includeProjectUser = false,
): Promise<CascadeResult> {
  const sources: CascadeResult['sources'] = [];
  let merged: Record<string, unknown> = {};

  const userEntity =
    (await repo.findCfgByScope('user', userId, null)) ??
    (await legacyGet(repo, `CFG-${userId.toUpperCase()}`));
  if (userEntity) {
    merged = deepMerge(merged, extractConfig(userEntity));
    sources.push({ scope: 'user', entity_id: userEntity.entity_id });
  }

  if (projectId) {
    const proyEntity =
      (await repo.findCfgByScope('project', null, projectId)) ??
      (await legacyGet(repo, `CFG-${projectId.toUpperCase()}`));
    if (proyEntity) {
      merged = deepMerge(merged, extractConfig(proyEntity));
      sources.push({ scope: 'project', entity_id: proyEntity.entity_id });
    }

    if (includeProjectUser) {
      const proyUserEntity =
        (await repo.findCfgByScope('project_user', userId, projectId)) ??
        (await legacyGet(
          repo,
          `CFG-${projectId.toUpperCase()}-${userId.toUpperCase()}`,
        ));
      if (proyUserEntity) {
        merged = deepMerge(merged, extractConfig(proyUserEntity));
        sources.push({ scope: 'project-user', entity_id: proyUserEntity.entity_id });
      }
    }
  }

  return { merged, sources };
}

async function legacyGet(repo: EntityRepo, id: string): Promise<Entity | null> {
  return repo.getById(id, true, true);
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
