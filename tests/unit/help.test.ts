/* SPDX-License-Identifier: AGPL-3.0-only */
import { describe, it, expect } from 'vitest';

import { helpTool } from '../../src/tools/help.js';
import type { ToolDeps } from '../../src/tools/index.js';

const stubDeps = {} as ToolDeps;

const ALL_TOPICS = [
  'bootstrap',
  'identity',
  'naming',
  'txn',
  'validation',
  'errors',
  'embeddings',
  'tools',
  'examples',
  'entity_types',
  'version',
  'install',
  'workspace-layout',
  'skill-playbooks',
] as const;

interface HelpResponse {
  topic: string;
  protocol_version: string;
  content: string;
  see_also?: string[];
  queries?: Array<{ step: number; tool: string; args?: Record<string, unknown>; purpose: string }>;
}

describe('helpTool — basic shape', () => {
  it('returns {topic, protocol_version, content} for every enum topic', async () => {
    for (const topic of ALL_TOPICS) {
      const out = (await helpTool.handler(stubDeps, { topic })) as HelpResponse;
      expect(out.topic).toBe(topic);
      expect(out.protocol_version).toMatch(/^\d+\.\d+$/);
      expect(typeof out.content).toBe('string');
      expect(out.content.length).toBeGreaterThan(0);
    }
  });

  it('rejects unknown topic via Zod enum', async () => {
    await expect(helpTool.handler(stubDeps, { topic: 'unknown-topic' })).rejects.toThrow();
  });

  it('rejects missing topic', async () => {
    await expect(helpTool.handler(stubDeps, {})).rejects.toThrow();
  });
});

describe('helpTool — bootstrap project-protocol', () => {
  it('topic bootstrap returns queries array with 7 ordered steps', async () => {
    const out = (await helpTool.handler(stubDeps, { topic: 'bootstrap' })) as HelpResponse;
    expect(Array.isArray(out.queries)).toBe(true);
    expect(out.queries).toHaveLength(7);
    out.queries?.forEach((q, idx) => {
      expect(q.step).toBe(idx + 1);
      expect(typeof q.tool).toBe('string');
      expect(typeof q.purpose).toBe('string');
    });
  });

  it('bootstrap queries cover whoami → PRJ → bootstrap_extras → check_interrupted → ROAD → REL → ISSUE', async () => {
    const out = (await helpTool.handler(stubDeps, { topic: 'bootstrap' })) as HelpResponse;
    const toolNames = out.queries?.map((q) => q.tool) ?? [];
    expect(toolNames[0]).toBe('whoami');
    expect(toolNames[1]).toBe('entity_get');
    expect(toolNames[2]).toBe('entity_get');
    expect(toolNames[3]).toBe('txn_check_interrupted');
    expect(toolNames[4]).toBe('entity_query');
    expect(toolNames[5]).toBe('entity_query');
    expect(toolNames[6]).toBe('entity_query');
  });

  it('bootstrap content is project bootstrap protocol, NOT install instructions', async () => {
    const out = (await helpTool.handler(stubDeps, { topic: 'bootstrap' })) as HelpResponse;
    expect(out.content).toMatch(/project bootstrap/i);
    expect(out.content).not.toMatch(/docker compose up/i);
  });

  it('install topic returns motor install instructions', async () => {
    const out = (await helpTool.handler(stubDeps, { topic: 'install' })) as HelpResponse;
    expect(out.content).toMatch(/docker compose up/i);
    expect(out.content).toMatch(/auth\.token/i);
  });
});

describe('helpTool — new topics', () => {
  it('topic workspace-layout documents PRJ.metadata + CMP.metadata conventions', async () => {
    const out = (await helpTool.handler(stubDeps, { topic: 'workspace-layout' })) as HelpResponse;
    expect(out.content).toMatch(/bootstrap_extras/);
    expect(out.content).toMatch(/owner_handle/);
    expect(out.content).toMatch(/workspace_layout/);
    expect(out.content).toMatch(/workspace_subdir/);
    expect(out.content).toMatch(/repo_url/);
  });

  it('topic skill-playbooks documents STD-<PROJECT>-<COMPONENT?>-<TOPIC> convention', async () => {
    const out = (await helpTool.handler(stubDeps, { topic: 'skill-playbooks' })) as HelpResponse;
    expect(out.content).toMatch(/STD-<PROJECT>-<COMPONENT\?>-<TOPIC>/);
    expect(out.content).toMatch(/DEPLOY-PROCESS/);
    expect(out.content).toMatch(/Fail-safe/);
  });
});

describe('helpTool — see_also integrity', () => {
  it('every see_also reference points to an existing topic', async () => {
    const responses: Record<string, HelpResponse> = {};
    for (const topic of ALL_TOPICS) {
      responses[topic] = (await helpTool.handler(stubDeps, { topic })) as HelpResponse;
    }
    const validTopics = new Set<string>(ALL_TOPICS);
    for (const [topic, resp] of Object.entries(responses)) {
      if (!resp.see_also) continue;
      for (const ref of resp.see_also) {
        expect(validTopics.has(ref), `topic "${topic}" references unknown topic "${ref}"`).toBe(true);
      }
    }
  });
});
