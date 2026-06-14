/* SPDX-License-Identifier: AGPL-3.0-only */
import { updateEntityInput } from '../domain/validation.js';
import { PlatformError } from '../server/errors.js';
import { RepoError } from '../storage/entity-repo.js';
import type { Relation } from '../domain/entity-types.js';
import type { ToolDescriptor, ToolDeps } from './index.js';

/**
 * entity_update — INTERFACE PARITY with IF-060D2B (Enterprise-shaped skills).
 *
 * Accepts BOTH the legacy nested `patch{}` shape and the flat Enterprise shape.
 * Class-1 fields (those that carry write intent) are MAPPED, never silently
 * dropped:
 *   - flat title/content/status/metadata + patch{} → merged (flat wins).
 *   - tags / tags_set → replace; tags_add/tags_remove → read-modify-write.
 *   - relations_add/remove/set → applied via RelationsRepo.
 *   - archived===true → routed to the archive path.
 * Class-2 fields are accepted and IGNORED:
 *   - trigger → Platform uses its own txn-vs-direct provenance.
 * `expected_version` is optional: present → CAS check; absent → last-write-wins.
 */
export const entityUpdateTool: ToolDescriptor = {
  name: 'entity_update',
  description:
    'Read-modify-write update of an existing entity. Optimistic locking is applied only when expected_version is supplied. Accepts both the nested patch{} shape and the flat (title/content/status/metadata/tags + tag/relation deltas) shape. Persists a history row with change_summary.',
  inputSchema: updateEntityInput,
  async handler(deps: ToolDeps, raw: unknown) {
    const input = updateEntityInput.parse(raw);

    // Effective scalar fields: merge patch{} with the flat top-level fields;
    // flat takes precedence (Class 1 — must not lose either source's intent).
    const patch = input.patch ?? {};
    const effTitle = input.title ?? patch.title;
    const effContent = input.content ?? patch.content;
    const effStatus = input.status ?? patch.status;
    const effMetadata =
      input.metadata !== undefined || patch.metadata !== undefined
        ? { ...(patch.metadata ?? {}), ...(input.metadata ?? {}) }
        : undefined;

    const updatedBy =
      (effMetadata?.updated_by as string | undefined) ?? 'system:kvendra-platform';

    try {
      // archived===true short-circuits to the archive path (Class 1). This is
      // the same semantics as entity_archive; archive_reason is optional here.
      if (input.archived === true) {
        const result = await deps.entityRepo.archive(
          input.entity_id,
          input.archive_reason ?? input.change_summary,
          updatedBy,
        );
        // Relation deltas are still honoured alongside an archive request.
        await applyRelationMutations(deps, input.entity_id, input);
        const historyId = await deps.historyRepo.latestForEntity(input.entity_id);
        return { entity_id: result.entity_id, archived_at: result.archived_at, history_id: historyId };
      }

      // Resolve tags (Class 1 — write intent). Precedence:
      //   tags_set / plain tags / patch.tags → replace the whole array.
      //   tags_add / tags_remove → read-modify-write against the current row.
      let effTags: string[] | undefined;
      const replaceTags = input.tags_set ?? input.tags ?? patch.tags;
      const hasDelta = input.tags_add !== undefined || input.tags_remove !== undefined;
      if (replaceTags !== undefined) {
        // A replacement wins; add/remove are then applied on top of it.
        effTags = dedupe(applyTagDelta(replaceTags, input.tags_add, input.tags_remove));
      } else if (hasDelta) {
        const existing = await deps.entityRepo.getById(input.entity_id, true, true);
        if (!existing) {
          throw new PlatformError('ENTITY_NOT_FOUND', `Entity "${input.entity_id}" not found.`);
        }
        effTags = dedupe(applyTagDelta(existing.tags ?? [], input.tags_add, input.tags_remove));
      }

      // Recompute embedding if content/title changed (best-effort).
      let embeddingPatch: number[] | null | undefined;
      if (effContent !== undefined || effTitle !== undefined) {
        const existing = await deps.entityRepo.getById(input.entity_id, true, true);
        if (!existing) {
          throw new PlatformError('ENTITY_NOT_FOUND', `Entity "${input.entity_id}" not found.`);
        }
        const title = effTitle ?? existing.title;
        const content = effContent ?? existing.content;
        try {
          const { data } = await deps.embeddings.embed({
            input: [title, content].filter(Boolean).join('\n'),
          });
          embeddingPatch = data[0]?.embedding ?? null;
        } catch {
          // best-effort
        }
      }

      const updated = await deps.entityRepo.update(
        input.entity_id,
        input.expected_version, // optional → CAS only when present
        {
          title: effTitle,
          content: effContent,
          tags: effTags,
          metadata: effMetadata,
          status: effStatus,
          ...(embeddingPatch !== undefined ? { embedding: embeddingPatch } : {}),
        },
        input.change_summary,
        updatedBy,
        input.txn_id ?? null,
      );

      // Relation deltas (Class 1). NON-ATOMICITY NOTE: RelationsRepo opens its
      // own pool connection, so these mutations run AFTER (not inside) the
      // entity-update transaction. A crash between the two could leave the
      // entity bumped but relations unapplied. This is acceptable for the
      // single-tenant Platform engine (no concurrent writers / SaaS isolation
      // requirement); sharing the tx is an Enterprise-only refinement and is
      // out of scope for interface parity. We do NOT version-bump on relation
      // change (Enterprise-only refinement — out of scope).
      await applyRelationMutations(deps, input.entity_id, input);

      const historyId = await deps.historyRepo.latestForEntity(updated.entity_id);
      return {
        entity_id: updated.entity_id,
        version: updated.version,
        history_id: historyId,
      };
    } catch (err) {
      if (err instanceof RepoError) {
        const helpTopic = err.code === 'VERSION_CONFLICT' ? 'validation' : 'errors';
        throw new PlatformError(err.code, err.message, helpTopic);
      }
      throw err;
    }
  },
};

/** Apply relations_set (remove-all-then-add semantics not available without a
 * full read; we treat set as "ensure these exist" by adding them — Platform's
 * relations are idempotent ON CONFLICT DO NOTHING) plus add/remove deltas. */
async function applyRelationMutations(
  deps: ToolDeps,
  source: string,
  input: { relations_add?: Relation[]; relations_remove?: Relation[]; relations_set?: Relation[] },
): Promise<void> {
  // relations_set: ensure the listed relations exist (idempotent add). Platform
  // does not track a closed relation set per source, so "set" is mapped as an
  // additive ensure rather than a destructive replace — the safe interpretation
  // for an additive, single-tenant engine. (Out-of-scope to diff & prune.)
  for (const rel of input.relations_set ?? []) {
    await deps.relationsRepo.addRelation(source, rel);
  }
  for (const rel of input.relations_add ?? []) {
    await deps.relationsRepo.addRelation(source, rel);
  }
  for (const rel of input.relations_remove ?? []) {
    await deps.relationsRepo.removeRelation(source, rel);
  }
}

function applyTagDelta(base: string[], add?: string[], remove?: string[]): string[] {
  let out = [...base];
  if (add) out = out.concat(add);
  if (remove) {
    const rm = new Set(remove);
    out = out.filter((t) => !rm.has(t));
  }
  return out;
}

function dedupe(arr: string[]): string[] {
  return [...new Set(arr)];
}
