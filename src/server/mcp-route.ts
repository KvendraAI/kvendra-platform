/* SPDX-License-Identifier: AGPL-3.0-only */
import type { FastifyInstance } from 'fastify';

import type { McpServer, JsonRpcRequest } from './mcp-server.js';

/**
 * Register the MCP endpoint at /mcp. Accepts JSON-RPC 2.0 over POST.
 * Notifications (no id) return 204 No Content; requests return the response.
 */
export function registerMcpRoute(app: FastifyInstance, server: McpServer): void {
  app.post('/mcp', async (req, reply) => {
    const body = req.body;
    if (!body || typeof body !== 'object') {
      return reply.code(400).send({
        jsonrpc: '2.0',
        id: null,
        error: { code: -32700, message: 'Parse error: expected JSON object' },
      });
    }
    const rpc = body as JsonRpcRequest;
    if (rpc.jsonrpc !== '2.0' || typeof rpc.method !== 'string') {
      return reply.code(400).send({
        jsonrpc: '2.0',
        id: rpc.id ?? null,
        error: { code: -32600, message: 'Invalid JSON-RPC request' },
      });
    }
    const response = await server.handle(rpc);
    if (response === null) {
      return reply.code(204).send();
    }
    return reply.send(response);
  });

  // GET /mcp returns the tool listing in JSON for human inspection.
  app.get('/mcp', async () => {
    return { server: 'kvendra-platform', tools: server.listTools() };
  });
}
