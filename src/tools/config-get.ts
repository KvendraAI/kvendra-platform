/* SPDX-License-Identifier: AGPL-3.0-only */
import { buildCfgCascade } from '../config/cfg-cascade.js';
import { configGetInput } from '../domain/validation.js';
import { resolveLocalIdentity } from './whoami.js';
import type { ToolDescriptor, ToolDeps } from './index.js';

async function resolveLocalUserId(deps: ToolDeps): Promise<string> {
  const identity = await resolveLocalIdentity(deps);
  return identity.user_id; // 'default' when uninit
}

export const configGetTool: ToolDescriptor = {
  name: 'config_get',
  description:
    'Return the cascaded CFG (USER → PROJECT → optional PROJECT-USER) as a merged JSON, plus the list of source entities that contributed.',
  inputSchema: configGetInput,
  async handler(deps: ToolDeps, raw: unknown) {
    const input = configGetInput.parse(raw);
    // INTERFACE PARITY: user_id is optional. When supplied, behaviour is
    // unchanged. When absent, resolve the local identity the same way whoami
    // does (CFG entity with metadata.config.identity.email), falling back to
    // 'default' if no CFG-USER is configured.
    const userId = input.user_id ?? (await resolveLocalUserId(deps));
    const cascade = await buildCfgCascade(
      deps.entityRepo,
      userId,
      input.project_id ?? null,
      input.project_user ?? false,
    );
    return cascade;
  },
};
