/* SPDX-License-Identifier: AGPL-3.0-only */

/**
 * Auth context shape — declared in CMP-KVD-PLATFORM as a wire-uniform
 * contract per REQ-KVD-ENTERPRISE-30F5D0 AC-IDP-16.
 *
 * - In **self-hosted** mode (this open-source motor running as a Docker
 *   image), there is no Cognito and no id_token. The shape is honored
 *   with `auth_mode: 'none' | 'local'` and `identity_source: 'local'`;
 *   most identity fields are `undefined`.
 *
 * - In **cloud** mode (CMP-KVD-ENTERPRISE wraps this motor), the SaasAuth
 *   Lambda authorizer populates the fields from the access_token +
 *   X-Id-Token headers.
 *
 * The contract is intentionally uniform across modes so that handlers,
 * skills and tooling consume the same shape regardless of deployment.
 * Self-hosted handlers MUST NOT rely on populated identity fields; they
 * are advisory only.
 */
export interface AuthContextShape {
  /** Stable user identifier. Cognito UUID in cloud; local username/uid in self-hosted. */
  sub: string;

  /** Optional verified email. Populated only when identity_source is 'id-token'. */
  email?: string;

  /**
   * Optional preferred username from id_token. Used by Enterprise to derive
   * audit `updated_by` strings (`human:<preferred_username>`).
   */
  preferred_username?: string;

  /** Optional full name from id_token. Advisory only. */
  name?: string;

  /** Whether the email claim has been verified by the IdP. */
  email_verified: boolean;

  /**
   * Cognito group membership in cloud (JSON-serialized list as a single
   * string for API GW context scalar constraint). Undefined in self-hosted.
   */
  cognito_groups?: string;

  /** Resolved tier. Always 'free' in self-hosted. */
  tier: 'free' | 'pro' | 'team' | 'enterprise';

  /** Postgres schema namespace (cloud) or `''` in self-hosted. */
  tenant_id: string;

  /**
   * How the request was authenticated.
   * - `jwt-access`  — cloud, Authorization Bearer access_token only.
   * - `jwt-id`      — cloud, Authorization Bearer id_token (dashboard path).
   * - `local`       — self-hosted with local token gate enabled.
   * - `none`        — self-hosted without auth gate.
   */
  auth_mode: 'jwt-access' | 'jwt-id' | 'local' | 'none';

  /**
   * Provenance of the identity fields above.
   * - `id-token`              — verified via X-Id-Token (high confidence).
   * - `access-token-fallback` — only access_token available (low confidence).
   * - `local`                 — self-hosted; identity is OS user / config.
   */
  identity_source: 'id-token' | 'access-token-fallback' | 'local';
}

/**
 * Self-hosted default — handed to handlers when no auth has been performed
 * (e.g. open mode for local development) or when the local token gate is
 * configured but no user mapping is loaded.
 */
export const LOCAL_AUTH_CONTEXT_DEFAULT: AuthContextShape = {
  sub: 'local',
  email_verified: false,
  tier: 'free',
  tenant_id: '',
  auth_mode: 'none',
  identity_source: 'local',
};
