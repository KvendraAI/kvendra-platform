/* SPDX-License-Identifier: AGPL-3.0-only */
import type { z } from 'zod';

type AnySchema = z.ZodType;

/**
 * Convert a Zod (v4) schema into a minimal JSON Schema accepted by MCP tools.
 * Supports the subset of Zod primitives used by the 14 platform tools:
 *   - z.object / z.string / z.number / z.boolean / z.array / z.enum
 *   - z.optional / z.nullable / z.default
 * Anything else degrades to `{ type: "object" }` which is permissive enough
 * for MCP discovery without blocking the tool listing.
 *
 * The output is part of the public tool contract (tools/list): keep it stable.
 */
export function zodToJsonSchema(schema: AnySchema): Record<string, unknown> {
  const def = defOf(schema);

  switch (def?.type) {
    case 'object': {
      const shape = (schema as z.ZodObject<z.ZodRawShape>).shape;
      const properties: Record<string, unknown> = {};
      const required: string[] = [];
      for (const [key, value] of Object.entries(shape)) {
        const fieldSchema = value as AnySchema;
        properties[key] = zodToJsonSchema(fieldSchema);
        if (!isOptionalInput(fieldSchema)) {
          required.push(key);
        }
      }
      const out: Record<string, unknown> = { type: 'object', properties };
      if (required.length) out.required = required;
      out.additionalProperties = false;
      return out;
    }
    case 'string':
      return { type: 'string' };
    case 'number':
      return { type: 'number' };
    case 'boolean':
      return { type: 'boolean' };
    case 'array':
      return {
        type: 'array',
        items: zodToJsonSchema((schema as z.ZodArray<AnySchema>).element),
      };
    case 'enum':
      return {
        type: 'string',
        enum: [...(schema as z.ZodEnum).options],
      };
    case 'optional':
    case 'nullable':
    case 'default':
      return zodToJsonSchema(def.innerType as AnySchema);
    case 'record':
      return { type: 'object', additionalProperties: true };
    case 'any':
    case 'unknown':
      return {};
    default:
      return { type: 'object' };
  }
}

interface MinimalDef {
  type: string;
  innerType?: unknown;
}

function defOf(schema: AnySchema): MinimalDef | undefined {
  return (schema as unknown as { _zod?: { def?: MinimalDef } })._zod?.def;
}

/** True when the field may be omitted by the caller (optional or defaulted). */
function isOptionalInput(schema: AnySchema): boolean {
  const type = defOf(schema)?.type;
  if (type === 'default' || type === 'prefault') return true;
  return (schema as unknown as { _zod?: { optin?: string } })._zod?.optin === 'optional';
}
