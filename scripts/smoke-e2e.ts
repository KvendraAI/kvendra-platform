/* SPDX-License-Identifier: AGPL-3.0-only */
/*
 * Standalone smoke E2E. Run with:
 *   PLATFORM_URL=http://localhost:7777 AUTH_TOKEN=$(cat ./data/auth.token) \
 *     npx tsx scripts/smoke-e2e.ts
 *
 * Walks PRJ → TXN → drafts → activate → search → cleanup.
 */

const BASE_URL = process.env.PLATFORM_URL ?? 'http://localhost:7777';
const TOKEN = process.env.AUTH_TOKEN ?? '';

if (!TOKEN) {
  console.error('Set AUTH_TOKEN (cat ./data/auth.token) before running this script.');
  process.exit(1);
}

let lastId = 0;
async function rpc(method: string, params: unknown) {
  lastId += 1;
  const res = await fetch(`${BASE_URL}/mcp`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      Authorization: `Bearer ${TOKEN}`,
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: lastId, method, params }),
  });
  const json = (await res.json()) as { result?: unknown; error?: { message: string } };
  if (json.error) throw new Error(json.error.message);
  return json.result as unknown;
}

async function tool(name: string, args: unknown) {
  const r = (await rpc('tools/call', { name, arguments: args })) as {
    isError?: boolean;
    content: Array<{ text: string }>;
  };
  const text = r.content[0]?.text ?? '{}';
  const parsed = JSON.parse(text);
  if (r.isError) throw new Error(parsed.message ?? 'tool error');
  return parsed;
}

async function main() {
  const started = Date.now();
  await rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {} });

  console.log('Creating PRJ-DEMO');
  await tool('entity_create', {
    entity_type: 'PRJ',
    force_id: 'PRJ-DEMO',
    project_id: 'DEMO',
    title: 'Demo project',
    content: 'kvendra platform smoke',
  });

  console.log('Opening TXN');
  const txn = (await tool('txn_create', {
    project_id: 'DEMO',
    type: 'feature',
    trigger: 'smoke',
    started_by: 'smoke',
  })) as { txn_id: string };

  console.log('Adding drafts');
  for (const t of ['CMP', 'ISSUE', 'ADR', 'ROAD'] as const) {
    const args: Record<string, unknown> = {
      entity_type: t,
      project_id: 'DEMO',
      title: `demo ${t.toLowerCase()}`,
      content: `something for ${t.toLowerCase()}`,
      txn_id: txn.txn_id,
    };
    if (t === 'CMP') args.force_id = 'CMP-DEMO-CORE';
    await tool('entity_create', args);
  }

  console.log('Activating TXN');
  await tool('txn_activate', { txn_id: txn.txn_id, activated_by: 'smoke' });

  console.log('Searching');
  const search = (await tool('entity_search', {
    query: 'demo project core',
    limit: 5,
    min_score: 0.0,
  })) as { results: unknown[] };
  console.log(`  Found ${search.results.length} hits.`);

  console.log(`Smoke completed in ${Date.now() - started}ms`);
}

main().catch((err) => {
  console.error('Smoke failed:', err);
  process.exit(1);
});
