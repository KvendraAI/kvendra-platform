/* SPDX-License-Identifier: AGPL-3.0-only */
import { describe, expect, it } from 'vitest';

import { deepMerge } from '../../src/config/cfg-cascade.js';

describe('deepMerge', () => {
  it('overrides shallow keys', () => {
    expect(deepMerge({ a: 1, b: 2 }, { b: 3 })).toEqual({ a: 1, b: 3 });
  });
  it('merges nested objects', () => {
    const out = deepMerge({ output: { length: 'short' } }, { output: { format: 'markdown' } });
    expect(out).toEqual({ output: { length: 'short', format: 'markdown' } });
  });
  it('replaces arrays (not merged)', () => {
    const out = deepMerge({ a: [1, 2] }, { a: [3] });
    expect(out).toEqual({ a: [3] });
  });
  it('applies cascade order USER → PROJECT → PROJECT-USER', () => {
    const user = { language: 'en', output: { length: 'short' } };
    const proy = { output: { length: 'detailed', format: 'markdown' } };
    const proyUser = { language: 'es' };
    const merged = deepMerge(deepMerge(user, proy), proyUser);
    expect(merged).toEqual({
      language: 'es',
      output: { length: 'detailed', format: 'markdown' },
    });
  });
});
