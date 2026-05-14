/* SPDX-License-Identifier: AGPL-3.0-only */
import { describe, expect, it } from 'vitest';

import { DEFAULT_SEMVER_SUFFIX_REGEX, isValidSemver } from '../../src/domain/semver.js';

describe('semver default regex', () => {
  it('matches MAJOR.MINOR.PATCH', () => {
    expect(DEFAULT_SEMVER_SUFFIX_REGEX.test('0.1.0')).toBe(true);
    expect(DEFAULT_SEMVER_SUFFIX_REGEX.test('1.2.3')).toBe(true);
  });
  it('matches build suffix', () => {
    expect(DEFAULT_SEMVER_SUFFIX_REGEX.test('0.1.0.7')).toBe(true);
  });
  it('matches pre-release', () => {
    expect(DEFAULT_SEMVER_SUFFIX_REGEX.test('0.1.0-alpha.0')).toBe(true);
  });
  it('rejects nonsense', () => {
    expect(DEFAULT_SEMVER_SUFFIX_REGEX.test('foo')).toBe(false);
    expect(DEFAULT_SEMVER_SUFFIX_REGEX.test('1')).toBe(false);
  });
});

describe('isValidSemver override', () => {
  it('honors override regex', () => {
    expect(isValidSemver('YEAR.2026', '^YEAR\\.\\d{4}$')).toBe(true);
    expect(isValidSemver('1.2.3', '^YEAR\\.\\d{4}$')).toBe(false);
  });
  it('returns false on uncompilable regex', () => {
    expect(isValidSemver('1.2.3', '(bad')).toBe(false);
  });
});
