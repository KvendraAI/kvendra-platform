/* SPDX-License-Identifier: AGPL-3.0-only */
import { whoamiInput } from '../domain/validation.js';
import type { ToolDescriptor, ToolDeps } from './index.js';

/**
 * Resolve the local identity (user_id + email) from a CFG entity whose
 * metadata.config.identity.email is set. Returns the 'default'/null pair when
 * no CFG-USER is configured (local-uninit). Shared by whoami and config_get.
 */
export async function resolveLocalIdentity(
  deps: ToolDeps,
): Promise<{ user_id: string; email: string | null; initialized: boolean }> {
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
    return { user_id: 'default', email: null, initialized: false };
  }
  const identity =
    ((userEntity.metadata as Record<string, unknown>).config as Record<string, unknown>)
      ?.identity as Record<string, unknown>;
  const userId = userEntity.entity_id.replace(/^CFG-/, '').toLowerCase();
  return {
    user_id: userId,
    email: (identity?.email as string | null) ?? null,
    initialized: true,
  };
}

export const whoamiTool: ToolDescriptor = {
  name: 'whoami',
  description:
    'Identity helper. In local self-host returns {user_id, email, mode:"local", tier, tenant_id, role, auth_mode} or the local-uninit variant if no CFG-USER is configured. tier/role/auth_mode/tenant_id are shape-compat constants — Platform is single-tenant.',
  inputSchema: whoamiInput,
  async handler(deps: ToolDeps, raw: unknown) {
    whoamiInput.parse(raw);
    const identity = await resolveLocalIdentity(deps);
    // INTERFACE PARITY (IF-060D2B): tier/tenant_id/role/auth_mode are added as
    // local-derived constants for shape compatibility with Enterprise whoami.
    // Platform is single-tenant: tier is 'free', role is 'owner', auth is
    // 'local', and tenant_id mirrors the local user_id (or 'local' if uninit).
    const parityFields = {
      tier: 'free' as const,
      tenant_id: identity.initialized ? identity.user_id : 'local',
      role: 'owner' as const,
      auth_mode: 'local' as const,
    };
    if (!identity.initialized) {
      return { user_id: 'default', email: null, mode: 'local-uninit' as const, ...parityFields };
    }
    return {
      user_id: identity.user_id,
      email: identity.email,
      mode: 'local' as const,
      ...parityFields,
    };
  },
};
