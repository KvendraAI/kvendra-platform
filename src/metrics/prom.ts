/* SPDX-License-Identifier: AGPL-3.0-only */
import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

export const registry = new Registry();
collectDefaultMetrics({ register: registry, prefix: 'kvendra_platform_' });

export const toolCallCounter = new Counter({
  name: 'kvendra_platform_tool_calls_total',
  help: 'Total MCP tool invocations.',
  labelNames: ['tool', 'outcome'] as const,
  registers: [registry],
});

export const toolLatency = new Histogram({
  name: 'kvendra_platform_tool_latency_seconds',
  help: 'Latency of MCP tool invocations in seconds.',
  labelNames: ['tool'] as const,
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [registry],
});

export const httpRequestCounter = new Counter({
  name: 'kvendra_platform_http_requests_total',
  help: 'Total HTTP requests served.',
  labelNames: ['method', 'route', 'status'] as const,
  registers: [registry],
});

// --- ISSUE-KVD-PLATFORM-007 — custom counters with kvendra_* prefix ---

export const toolCallsTotal = new Counter({
  name: 'kvendra_tool_calls_total',
  help: 'Total MCP tool calls by name and status.',
  labelNames: ['tool', 'status'] as const,
  registers: [registry],
});

export const toolDurationMs = new Histogram({
  name: 'kvendra_tool_duration_ms',
  help: 'Duration of MCP tool calls in ms.',
  labelNames: ['tool'] as const,
  buckets: [5, 10, 25, 50, 100, 250, 500, 1000],
  registers: [registry],
});

export const txnInProgress = new Gauge({
  name: 'kvendra_txn_in_progress',
  help: 'Number of TXNs currently in-progress.',
  registers: [registry],
});
