/* SPDX-License-Identifier: AGPL-3.0-only */
import { searchInput } from '../domain/validation.js';
import type { ToolDescriptor, ToolDeps } from './index.js';

export const entitySearchTool: ToolDescriptor = {
  name: 'entity_search',
  description:
    'Semantic search over entities by cosine similarity. Query MUST be at least 3 characters. Honors entity_type, project_id, tags_all, include_archived.',
  inputSchema: searchInput,
  async handler(deps: ToolDeps, raw: unknown) {
    const input = searchInput.parse(raw);
    const { data } = await deps.embeddings.embed({ input: input.query });
    const queryVec = data[0]?.embedding ?? [];
    const limit = input.limit ?? 10;
    // INTERFACE PARITY: default lowered 0.4 → 0.2 to match Enterprise recall.
    const min_score = input.min_score ?? 0.2;
    const hits = await deps.entityRepo.search({
      query_embedding: queryVec,
      ...(input.entity_type ? { entity_type: input.entity_type } : {}),
      ...(input.project_id ? { project_id: input.project_id } : {}),
      ...(input.tags_all ? { tags_all: input.tags_all } : {}),
      limit,
      min_score,
      include_archived: input.include_archived ?? false,
    });
    return { results: hits };
  },
};
