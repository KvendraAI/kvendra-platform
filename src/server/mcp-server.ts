/* SPDX-License-Identifier: AGPL-3.0-only */
import type { ToolDeps, ToolDescriptor } from '../tools/index.js';
import { buildToolRegistry, TOOL_NAMES } from '../tools/index.js';
import { zodToJsonSchema } from '../utils/zod-to-mcp.js';
import { toolCallCounter, toolLatency, toolCallsTotal, toolDurationMs } from '../metrics/prom.js';
import { asErrorPayload, PlatformError } from './errors.js';
import { logger } from '../utils/logger.js';

/**
 * Minimal JSON-RPC 2.0 dispatcher implementing the MCP subset we need
 * (initialize, tools/list, tools/call, notifications/initialized).
 *
 * Using a hand-rolled dispatcher rather than the full
 * @modelcontextprotocol/sdk transport because we want a single Fastify HTTP
 * route that handles the JSON request/response flow directly and lets us
 * apply the auth preHandler uniformly (per AC-PLAT-12). Streamable HTTP
 * upgrade is reserved for M2 when long-running tool calls land.
 */

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: number | string | null;
  method: string;
  params?: unknown;
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number | string | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

const PROTOCOL_VERSION = '2024-11-05';
const SERVER_NAME = 'kvendra-platform';
const SERVER_VERSION = '0.1.0-alpha.0';

export class McpServer {
  private readonly registry: Record<string, ToolDescriptor>;

  constructor(private readonly deps: ToolDeps) {
    this.registry = buildToolRegistry();
  }

  async handle(req: JsonRpcRequest): Promise<JsonRpcResponse | null> {
    const id = req.id ?? null;
    try {
      switch (req.method) {
        case 'initialize':
          return {
            jsonrpc: '2.0',
            id,
            result: {
              protocolVersion: PROTOCOL_VERSION,
              capabilities: { tools: { listChanged: false } },
              serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
            },
          };
        case 'notifications/initialized':
          // Notification — no response.
          return null;
        case 'tools/list':
          return { jsonrpc: '2.0', id, result: { tools: this.listTools() } };
        case 'tools/call':
          return { jsonrpc: '2.0', id, result: await this.callTool(req.params) };
        case 'ping':
          return { jsonrpc: '2.0', id, result: {} };
        default:
          return {
            jsonrpc: '2.0',
            id,
            error: { code: -32601, message: `Method not found: ${req.method}` },
          };
      }
    } catch (err) {
      if (err instanceof PlatformError) {
        return {
          jsonrpc: '2.0',
          id,
          error: {
            code: -32000,
            message: err.message,
            data: asErrorPayload(err),
          },
        };
      }
      logger.error({ err }, 'MCP dispatch error');
      return {
        jsonrpc: '2.0',
        id,
        error: {
          code: -32603,
          message: (err as Error).message ?? 'Internal error',
          data: asErrorPayload(err),
        },
      };
    }
  }

  listTools(): Array<{ name: string; description: string; inputSchema: unknown }> {
    return TOOL_NAMES.map((name) => {
      const tool = this.registry[name];
      if (!tool) throw new Error(`Tool "${name}" not registered`);
      return {
        name: tool.name,
        description: tool.description,
        inputSchema: zodToJsonSchema(tool.inputSchema),
      };
    });
  }

  async callTool(params: unknown): Promise<{ content: Array<{ type: 'text'; text: string }>; isError?: boolean }> {
    const p = params as { name?: string; arguments?: unknown } | undefined;
    const toolName = p?.name;
    if (!toolName) {
      throw new PlatformError('INVALID_PARAMS', 'tools/call requires { name, arguments }.');
    }
    const tool = this.registry[toolName];
    if (!tool) {
      throw new PlatformError('TOOL_NOT_FOUND', `Tool "${toolName}" is not registered.`, 'tools');
    }
    const end = toolLatency.startTimer({ tool: toolName });
    const startMs = Date.now();
    let status: 'ok' | 'error' = 'ok';
    try {
      const result = await tool.handler(this.deps, p?.arguments ?? {});
      toolCallCounter.inc({ tool: toolName, outcome: 'ok' });
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    } catch (err) {
      status = 'error';
      toolCallCounter.inc({ tool: toolName, outcome: 'error' });
      if (err instanceof PlatformError) {
        return {
          isError: true,
          content: [{ type: 'text', text: JSON.stringify(err.toPayload()) }],
        };
      }
      const message = (err as Error).message ?? String(err);
      return {
        isError: true,
        content: [{ type: 'text', text: JSON.stringify({ code: 'INTERNAL_ERROR', message }) }],
      };
    } finally {
      end();
      toolDurationMs.labels(toolName).observe(Date.now() - startMs);
      toolCallsTotal.labels(toolName, status).inc();
    }
  }
}
