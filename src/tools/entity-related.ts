/* SPDX-License-Identifier: AGPL-3.0-only */
import { relatedInput } from '../domain/validation.js';
import { PlatformError } from '../server/errors.js';
import type { ToolDescriptor, ToolDeps } from './index.js';

export const entityRelatedTool: ToolDescriptor = {
  name: 'entity_related',
  description: 'Find entities semantically close to a given entity (cosine similarity over embeddings).',
  inputSchema: relatedInput,
  async handler(deps: ToolDeps, raw: unknown) {
    const input = relatedInput.parse(raw);
    const entity = await deps.entityRepo.getById(input.entity_id, true, true);
    if (!entity) {
      throw new PlatformError(
        'ENTITY_NOT_FOUND',
        `Entity "${input.entity_id}" not found.`,
      );
    }
    const limit = input.limit ?? 10;
    const min_score = input.min_score ?? 0.5;
    const { data } = await deps.embeddings.embed({
      input: [entity.title, entity.content].filter(Boolean).join('\n'),
    });
    const queryVec = data[0]?.embedding ?? [];
    const hits = await deps.entityRepo.search({
      query_embedding: queryVec,
      ...(input.entity_type ? { entity_type: input.entity_type } : {}),
      limit: limit + 1,
      min_score,
      include_archived: false,
    });
    const related = hits
      .filter((h) => h.entity_id !== input.entity_id)
      .slice(0, limit)
      .map((h) => ({ entity_id: h.entity_id, score: h.score, title: h.title }));
    return { related };
  },
};
