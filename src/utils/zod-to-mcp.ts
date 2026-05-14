/* SPDX-License-Identifier: AGPL-3.0-only */
import type { ZodTypeAny } from 'zod';
import { z } from 'zod';

/**
 * Convert a Zod schema into a minimal JSON Schema accepted by MCP tools.
 * Supports the subset of Zod primitives used by the 14 platform tools:
 *   - z.object / z.string / z.number / z.boolean / z.array / z.enum
 *   - z.optional / z.nullable / z.default
 * Anything else degrades to `{ type: "object" }` which is permissive enough
 * for MCP discovery without blocking the tool listing.
 */
export function zodToJsonSchema(schema: ZodTypeAny): Record<string, unknown> {
  const def = (schema as unknown as { _def: { typeName: string } })._def;
  const name = def?.typeName;

  switch (name) {
    case 'ZodObject': {
      const shape = (schema as z.ZodObject<z.ZodRawShape>).shape;
      const properties: Record<string, unknown> = {};
      const required: string[] = [];
      for (const [key, value] of Object.entries(shape)) {
        const fieldSchema = value as ZodTypeAny;
        properties[key] = zodToJsonSchema(fieldSchema);
        if (!fieldSchema.isOptional() && !isDefaulted(fieldSchema)) {
          required.push(key);
        }
      }
      const out: Record<string, unknown> = { type: 'object', properties };
      if (required.length) out.required = required;
      out.additionalProperties = false;
      return out;
    }
    case 'ZodString':
      return { type: 'string' };
    case 'ZodNumber':
      return { type: 'number' };
    case 'ZodBoolean':
      return { type: 'boolean' };
    case 'ZodArray':
      return {
        type: 'array',
        items: zodToJsonSchema((schema as z.ZodArray<ZodTypeAny>).element),
      };
    case 'ZodEnum':
      return {
        type: 'string',
        enum: [...(schema as z.ZodEnum<[string, ...string[]]>).options],
      };
    case 'ZodOptional':
      return zodToJsonSchema((schema as z.ZodOptional<ZodTypeAny>).unwrap());
    case 'ZodNullable':
      return zodToJsonSchema((schema as z.ZodNullable<ZodTypeAny>).unwrap());
    case 'ZodDefault':
      return zodToJsonSchema((schema as z.ZodDefault<ZodTypeAny>).removeDefault());
    case 'ZodRecord':
      return { type: 'object', additionalProperties: true };
    case 'ZodAny':
    case 'ZodUnknown':
      return {};
    default:
      return { type: 'object' };
  }
}

function isDefaulted(schema: ZodTypeAny): boolean {
  const def = (schema as unknown as { _def: { typeName: string } })._def;
  return def?.typeName === 'ZodDefault';
}
