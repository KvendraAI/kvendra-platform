/* SPDX-License-Identifier: AGPL-3.0-only */
/*
 * AC-PLAT-11 — end-to-end smoke: PRJ → TXN → drafts (CMP, ISSUE, ADR, ROAD)
 * → activate → search → cleanup, in under 60 seconds.
 *
 * Assumes the platform is reachable at PLATFORM_URL (default
 * http://localhost:7777) with AUTH_TOKEN bearer. Tester v3 wires the
 * complete fixture during phase 4.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const BASE_URL = process.env.PLATFORM_URL ?? 'http://localhost:7777';
const TOKEN = process.env.AUTH_TOKEN ?? '';
const HAS_PLATFORM = Boolean(TOKEN);

const describeIfPlatform = HAS_PLATFORM ? describe : describe.skip;

let lastId = 0;
function nextId() {
  lastId += 1;
  return lastId;
}

async function rpc(method: string, params: unknown): Promise<unknown> {
  const res = await fetch(`${BASE_URL}/mcp`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      Authorization: `Bearer ${TOKEN}`,
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: nextId(), method, params }),
  });
  const json = (await res.json()) as { result?: unknown; error?: { message: string } };
  if (json.error) throw new Error(json.error.message);
  return json.result;
}

async function callTool(name: string, args: unknown): Promise<unknown> {
  const r = (await rpc('tools/call', { name, arguments: args })) as {
    isError?: boolean;
    content: Array<{ text: string }>;
  };
  const text = r.content[0]?.text ?? '{}';
  const parsed = JSON.parse(text);
  if (r.isError) throw new Error((parsed.message as string) ?? 'tool error');
  return parsed;
}

describeIfPlatform('AC-PLAT-11 end-to-end full flow', () => {
  beforeAll(async () => {
    await rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {} });
  });

  afterAll(async () => {
    // best-effort cleanup
    try {
      await callTool('entity_archive', { entity_id: 'PRJ-DEMO', archive_reason: 'e2e cleanup' });
    } catch {
      /* ignore */
    }
  });

  it('runs the full flow in under 60 seconds', async () => {
    const t0 = Date.now();

    // 1) PRJ
    await callTool('entity_create', {
      entity_type: 'PRJ',
      entity_id: 'PRJ-DEMO',
      project_id: 'DEMO',
      title: 'Demo project',
      content: 'kvendra platform smoke test',
    });

    // 2) TXN
    const txn = (await callTool('txn_create', {
      project_id: 'DEMO',
      type: 'feature',
      trigger: 'e2e',
      started_by: 'e2e',
    })) as { txn_id: string };

    // 3) Drafts (CMP, ISSUE, ADR, ROAD)
    await callTool('entity_create', {
      entity_type: 'CMP',
      entity_id: 'CMP-DEMO-CORE',
      project_id: 'DEMO',
      title: 'Core component',
      content: 'demo core',
      txn_id: txn.txn_id,
    });
    await callTool('entity_create', {
      entity_type: 'ISSUE',
      project_id: 'DEMO',
      component_id: 'DEMO-CORE',
      title: 'demo issue',
      content: 'something to fix',
      txn_id: txn.txn_id,
    });
    await callTool('entity_create', {
      entity_type: 'ADR',
      project_id: 'DEMO',
      title: 'demo decision',
      content: 'we will use kvendra',
      txn_id: txn.txn_id,
    });
    await callTool('entity_create', {
      entity_type: 'ROAD',
      project_id: 'DEMO',
      title: 'demo roadmap',
      content: 'milestones',
      txn_id: txn.txn_id,
    });

    // 4) Activate
    await callTool('txn_activate', { txn_id: txn.txn_id, activated_by: 'e2e' });

    // 5) Search
    const search = (await callTool('entity_search', {
      query: 'demo project core',
      limit: 5,
      min_score: 0.0,
    })) as { results: Array<{ entity_id: string }> };
    expect(search.results.length).toBeGreaterThan(0);

    // 6) Query
    const q = (await callTool('entity_query', { project_id: 'DEMO', limit: 50 })) as {
      total: number;
    };
    expect(q.total).toBeGreaterThanOrEqual(5);

    // 7) Get with relations
    const got = (await callTool('entity_get', { entity_id: 'PRJ-DEMO' })) as {
      entity: { entity_id: string };
    };
    expect(got.entity.entity_id).toBe('PRJ-DEMO');

    // 8) interrupted should be empty for DEMO
    const interrupted = (await callTool('txn_check_interrupted', { project_id: 'DEMO' })) as {
      interrupted: unknown[];
    };
    expect(interrupted.interrupted.length).toBe(0);

    expect(Date.now() - t0).toBeLessThan(60_000);
  }, 90_000);
});
