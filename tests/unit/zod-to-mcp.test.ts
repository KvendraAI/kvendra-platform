/* SPDX-License-Identifier: AGPL-3.0-only */
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { zodToJsonSchema } from '../../src/utils/zod-to-mcp.js';

describe('zodToJsonSchema', () => {
  it('converts simple objects with required/optional', () => {
    const schema = z.object({
      foo: z.string(),
      bar: z.number().optional(),
    });
    const json = zodToJsonSchema(schema) as Record<string, unknown>;
    expect(json.type).toBe('object');
    const required = json.required as string[];
    expect(required).toContain('foo');
    expect(required).not.toContain('bar');
  });

  it('converts enums', () => {
    const schema = z.enum(['a', 'b', 'c']);
    expect(zodToJsonSchema(schema)).toEqual({ type: 'string', enum: ['a', 'b', 'c'] });
  });

  it('treats defaulted, optional and nullable-optional fields as not required', () => {
    const schema = z.object({
      title: z.string(),
      content: z.string().default(''),
      tags: z.array(z.string()).optional(),
      metadata: z.record(z.string(), z.unknown()).optional(),
    });
    const json = zodToJsonSchema(schema) as Record<string, unknown>;
    expect(json.required).toEqual(['title']);
    expect((json.properties as Record<string, unknown>).content).toEqual({ type: 'string' });
    expect((json.properties as Record<string, unknown>).metadata).toEqual({
      type: 'object',
      additionalProperties: true,
    });
  });

  it('converts arrays', () => {
    const schema = z.array(z.string());
    expect(zodToJsonSchema(schema)).toEqual({ type: 'array', items: { type: 'string' } });
  });
});
