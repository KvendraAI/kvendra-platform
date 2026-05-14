/* SPDX-License-Identifier: AGPL-3.0-only */
import { updateEntityInput } from '../domain/validation.js';
import { PlatformError } from '../server/errors.js';
import { RepoError } from '../storage/entity-repo.js';
import type { ToolDescriptor, ToolDeps } from './index.js';

export const entityUpdateTool: ToolDescriptor = {
  name: 'entity_update',
  description:
    'Read-modify-write update of an existing entity with optimistic locking by expected_version. Persists a history row with change_summary.',
  inputSchema: updateEntityInput,
  async handler(deps: ToolDeps, raw: unknown) {
    const input = updateEntityInput.parse(raw);
    const updatedBy =
      (input.patch.metadata?.updated_by as string | undefined) ?? 'system:kvendra-platform';

    try {
      // Recompute embedding if content/title changed (best-effort).
      let embeddingPatch: number[] | null | undefined;
      if (input.patch.content !== undefined || input.patch.title !== undefined) {
        const existing = await deps.entityRepo.getById(input.entity_id, true, true);
        if (!existing) {
          throw new PlatformError(
            'ENTITY_NOT_FOUND',
            `Entity "${input.entity_id}" not found.`,
          );
        }
        const title = input.patch.title ?? existing.title;
        const content = input.patch.content ?? existing.content;
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
        input.expected_version,
        {
          title: input.patch.title,
          content: input.patch.content,
          tags: input.patch.tags,
          metadata: input.patch.metadata,
          status: input.patch.status,
          ...(embeddingPatch !== undefined ? { embedding: embeddingPatch } : {}),
        },
        input.change_summary,
        updatedBy,
        input.txn_id ?? null,
      );

      return {
        entity_id: updated.entity_id,
        version: updated.version,
        history_id: null,
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
