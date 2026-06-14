/* SPDX-License-Identifier: AGPL-3.0-only */
/*
 * Contract conformance (anti-drift) — TXN-KVD-20260614-006.
 *
 * Asserts that representative IF-060D2B-shaped payloads (the calls
 * kvendra-skills 1.7.0 sends against the Enterprise KB) PARSE against the
 * Platform engine's Zod input schemas with NO ZodError. This is INTERFACE
 * parity: ONE skill set must validate on both KBs.
 *
 * It also guards back-compat: the LEGACY Platform shapes (nested patch{},
 * expected_version present) must still parse.
 *
 * This test guards against future schema NARROWING. If a field is removed or
 * made required again, a payload below stops parsing and this suite fails.
 */
import { describe, expect, it } from 'vitest';

import {
  createEntityInput,
  updateEntityInput,
  archiveEntityInput,
  relatedInput,
  searchInput,
  txnActivateInput,
  txnCancelInput,
  configGetInput,
} from '../../src/domain/validation.js';

describe('IF-060D2B contract conformance — Enterprise-shaped payloads parse', () => {
  it('entity_update: flat shape with tag/relation deltas, archived, trigger', () => {
    const payload = {
      entity_id: 'ISSUE-KVD-X',
      expected_version: 3,
      content: 'x',
      status: 'done',
      tags_add: ['a'],
      tags_remove: ['b'],
      relations_add: [{ type: 'part_of', target: 'REL-X' }],
      archived: false,
      trigger: 'skill:x',
      change_summary: 'y',
    };
    expect(() => updateEntityInput.parse(payload)).not.toThrow();
  });

  it('entity_update: flat shape WITHOUT expected_version (lenient last-write-wins)', () => {
    const payload = {
      entity_id: 'ISSUE-KVD-X',
      title: 'New title',
      tags_set: ['x', 'y'],
      relations_set: [{ type: 'depends_on', target: 'CMP-KVD-Y' }],
      relations_remove: [{ type: 'blocks', target: 'ISSUE-KVD-Z' }],
      change_summary: 'set tags + relations',
    };
    const parsed = updateEntityInput.parse(payload);
    expect(parsed.expected_version).toBeUndefined();
  });

  it('entity_update: archive-via-update with archive_reason', () => {
    const payload = {
      entity_id: 'ISSUE-KVD-X',
      archived: true,
      archive_reason: 'superseded',
      change_summary: 'archiving',
    };
    expect(() => updateEntityInput.parse(payload)).not.toThrow();
  });

  it('entity_create: force_id alias + minimal fields', () => {
    const payload = {
      entity_type: 'ISSUE',
      title: 't',
      force_id: 'ISSUE-KVD-X',
    };
    const parsed = createEntityInput.parse(payload);
    expect(parsed.force_id).toBe('ISSUE-KVD-X');
  });

  it('entity_archive: archive_reason optional (absent parses)', () => {
    expect(() => archiveEntityInput.parse({ entity_id: 'ISSUE-KVD-X' })).not.toThrow();
  });

  it('txn_activate: { txn_id } only (activated_by optional)', () => {
    expect(() => txnActivateInput.parse({ txn_id: 'TXN-X' })).not.toThrow();
  });

  it('txn_cancel: { txn_id, reason } only (cancelled_by optional)', () => {
    expect(() => txnCancelInput.parse({ txn_id: 'TXN-X', reason: 'r' })).not.toThrow();
  });

  it('config_get: {} (user_id optional)', () => {
    expect(() => configGetInput.parse({})).not.toThrow();
  });

  it('entity_related: { entity_id, depth } (depth accepted-and-ignored)', () => {
    expect(() => relatedInput.parse({ entity_id: 'X', depth: 1 })).not.toThrow();
  });

  it('entity_search: min_score may be omitted (default applied in handler)', () => {
    expect(() => searchInput.parse({ query: 'abc' })).not.toThrow();
  });
});

describe('Back-compat (Task 4) — legacy Platform shapes still parse', () => {
  it('entity_update: legacy nested patch{} + expected_version present', () => {
    const payload = {
      entity_id: 'ISSUE-KVD-X',
      expected_version: 2,
      patch: {
        title: 'legacy title',
        content: 'legacy content',
        tags: ['t1'],
        metadata: { foo: 'bar' },
        status: 'in_progress',
      },
      change_summary: 'legacy update',
    };
    const parsed = updateEntityInput.parse(payload);
    expect(parsed.expected_version).toBe(2);
    expect(parsed.patch?.title).toBe('legacy title');
  });

  it('entity_create: legacy entity_id (no force_id)', () => {
    const payload = { entity_type: 'PRJ', entity_id: 'PRJ-TEST', title: 't' };
    const parsed = createEntityInput.parse(payload);
    expect(parsed.entity_id).toBe('PRJ-TEST');
  });

  it('txn_activate/txn_cancel/config_get: legacy required-field shapes still parse', () => {
    expect(() => txnActivateInput.parse({ txn_id: 'TXN-X', activated_by: 'me' })).not.toThrow();
    expect(() =>
      txnCancelInput.parse({ txn_id: 'TXN-X', reason: 'r', cancelled_by: 'me' }),
    ).not.toThrow();
    expect(() => configGetInput.parse({ user_id: 'me' })).not.toThrow();
  });
});
