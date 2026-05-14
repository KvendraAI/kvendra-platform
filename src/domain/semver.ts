/* SPDX-License-Identifier: AGPL-3.0-only */

/**
 * Default Kvendra SemVer regex for REL entity_id suffix (per ADR-KVD-PLATFORM-004).
 * Matches `X.Y.Z` or `X.Y.Z.W` optionally followed by `-<suffix>`.
 */
export const DEFAULT_SEMVER_SUFFIX_REGEX = /^\d+\.\d+\.\d+(?:\.\d+)?(?:-[A-Za-z0-9.-]+)?$/;

export function isValidSemver(version: string, override?: string | null): boolean {
  if (override) {
    try {
      return new RegExp(override).test(version);
    } catch {
      return false;
    }
  }
  return DEFAULT_SEMVER_SUFFIX_REGEX.test(version);
}
