/* SPDX-License-Identifier: AGPL-3.0-only */
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { ENGINE_VERSION } from '../../src/version.js';

describe('ENGINE_VERSION', () => {
  it('matches package.json (no hardcoded version string)', () => {
    const pkg = JSON.parse(
      readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
    ) as {
      version: string;
    };
    expect(ENGINE_VERSION).toBe(pkg.version);
  });
});
