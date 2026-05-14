/* SPDX-License-Identifier: AGPL-3.0-only */
import { whoamiInput } from '../domain/validation.js';
import type { ToolDescriptor, ToolDeps } from './index.js';

export const whoamiTool: ToolDescriptor = {
  name: 'whoami',
  description:
    'Identity helper. In local self-host returns {user_id, email, mode:"local"} or {user_id:"default", email:null, mode:"local-uninit"} if no CFG-USER is configured.',
  inputSchema: whoamiInput,
  async handler(deps: ToolDeps, raw: unknown) {
    whoamiInput.parse(raw);
    // Look for any CFG entity whose entity_id starts with "CFG-" and metadata.config.identity is set.
    const { entities } = await deps.entityRepo.query({
      entity_type: 'CFG',
      drafts: false,
      archived: false,
      limit: 100,
      offset: 0,
    });
    const userEntity = entities.find((e) => {
      const cfg = e.metadata?.config as Record<string, unknown> | undefined;
      const identity = cfg?.identity as Record<string, unknown> | undefined;
      return Boolean(identity?.email);
    });
    if (!userEntity) {
      return { user_id: 'default', email: null, mode: 'local-uninit' as const };
    }
    const identity =
      ((userEntity.metadata as Record<string, unknown>).config as Record<string, unknown>)
        ?.identity as Record<string, unknown>;
    const userId = userEntity.entity_id.replace(/^CFG-/, '').toLowerCase();
    return {
      user_id: userId,
      email: (identity?.email as string | null) ?? null,
      mode: 'local' as const,
    };
  },
};
