/* SPDX-License-Identifier: AGPL-3.0-only */
/*
 * Session-brief PARITY guard — Platform ↔ Enterprise (REQ-KVD-ENTERPRISE-E74F80).
 *
 * Context: Enterprise added an opt-in `include_brief` param to `whoami` that
 * triggers a `computeSessionBrief` (the "session brief" feature). That feature
 * is ENTERPRISE-ONLY by design (AGPL §13 — SaaS-only changes live in
 * `@kvendra/enterprise-core`, NOT in this open motor). Platform must NOT carry
 * it, neither as a accepted param, nor leaked into the bootstrap protocol, nor
 * as a dependency/symbol.
 *
 * This is a paridad guard: a pure test (AGPL-fine — no production code added).
 * If a future change drifts Platform towards the Enterprise feature (loosens the
 * whoami schema, threads include_brief into the bootstrap step 1, or pulls in
 * computeSessionBrief / enterprise-core), one of the asserts below fails LOUDLY.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { whoamiInput } from '../../src/domain/validation.js';
import { helpTool } from '../../src/tools/help.js';
import type { ToolDeps } from '../../src/tools/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../..');

const stubDeps = {} as ToolDeps;

interface BootstrapQuery {
  step: number;
  tool: string;
  args?: Record<string, unknown>;
  purpose: string;
}

// Read the bootstrap queries through the PUBLIC help handler (same access path
// as help.test.ts). PROJECT_BOOTSTRAP_QUERIES is a private module const — we do
// NOT widen its visibility for the sake of a test.
async function bootstrapQueries(): Promise<BootstrapQuery[]> {
  const out = (await helpTool.handler(stubDeps, { topic: 'bootstrap' })) as {
    queries?: BootstrapQuery[];
  };
  return out.queries ?? [];
}

describe('session-brief parity — whoamiInput rejects the Enterprise-only param', () => {
  it('accepts the empty params object {}', () => {
    expect(() => whoamiInput.parse({})).not.toThrow();
  });

  it('rejects { include_brief: true } (.strict() forbids unknown params)', () => {
    const result = whoamiInput.safeParse({ include_brief: true });
    expect(result.success).toBe(false);
  });

  it('rejects include_brief regardless of value (false/string) — unknown key, not value', () => {
    expect(whoamiInput.safeParse({ include_brief: false }).success).toBe(false);
    expect(whoamiInput.safeParse({ include_brief: 'yes' }).success).toBe(false);
  });
});

describe('session-brief parity — bootstrap protocol step 1 never filters the Enterprise param', () => {
  it('step 1 is whoami', async () => {
    const step1 = (await bootstrapQueries()).find((q) => q.step === 1);
    expect(step1).toBeDefined();
    expect(step1?.tool).toBe('whoami');
  });

  it('step 1 whoami carries NO args (no include_brief threaded into bootstrap)', async () => {
    const step1 = (await bootstrapQueries()).find((q) => q.step === 1);
    // Platform's bootstrap calls whoami with no args at all.
    expect(step1?.args).toBeUndefined();
  });

  it('NO bootstrap query anywhere references include_brief in its args', async () => {
    for (const q of await bootstrapQueries()) {
      expect(q.args ?? {}).not.toHaveProperty('include_brief');
    }
  });
});

describe('session-brief parity — Platform does not depend on or reference the Enterprise feature', () => {
  it('package.json declares no @kvendra/enterprise* dependency', () => {
    const pkg = JSON.parse(readFileSync(resolve(repoRoot, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const allDeps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
    const enterpriseDeps = Object.keys(allDeps).filter((d) => d.startsWith('@kvendra/enterprise'));
    expect(enterpriseDeps).toEqual([]);
  });

  it('whoami source does not import/use computeSessionBrief, session-brief, or include_brief', () => {
    const whoamiSrc = readFileSync(resolve(repoRoot, 'src/tools/whoami.ts'), 'utf8');
    expect(whoamiSrc).not.toMatch(/computeSessionBrief/);
    expect(whoamiSrc).not.toMatch(/session-brief/);
    expect(whoamiSrc).not.toMatch(/include_brief/);
  });

  it('validation source does not loosen whoamiInput towards include_brief', () => {
    const validationSrc = readFileSync(resolve(repoRoot, 'src/domain/validation.ts'), 'utf8');
    expect(validationSrc).not.toMatch(/include_brief/);
    // whoamiInput stays a strict empty object — the actual rejection is asserted
    // above; this is the source-level smell guard.
    expect(validationSrc).toMatch(/whoamiInput\s*=\s*z\.object\(\{\}\)\.strict\(\)/);
  });
});
