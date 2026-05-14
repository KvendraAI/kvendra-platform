/* SPDX-License-Identifier: AGPL-3.0-only */
import { buildCfgCascade } from '../config/cfg-cascade.js';
import { configGetInput } from '../domain/validation.js';
import type { ToolDescriptor, ToolDeps } from './index.js';

export const configGetTool: ToolDescriptor = {
  name: 'config_get',
  description:
    'Return the cascaded CFG (USER → PROJECT → optional PROJECT-USER) as a merged JSON, plus the list of source entities that contributed.',
  inputSchema: configGetInput,
  async handler(deps: ToolDeps, raw: unknown) {
    const input = configGetInput.parse(raw);
    const cascade = await buildCfgCascade(
      deps.entityRepo,
      input.user_id,
      input.project_id ?? null,
      input.project_user ?? false,
    );
    return cascade;
  },
};
