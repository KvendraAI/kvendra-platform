/* SPDX-License-Identifier: AGPL-3.0-only */
import { describe, it, expect } from 'vitest';

import { resolveEntityId, validateForceId } from '../../src/domain/ids.js';
import { generateEntityId, parseEntityId } from '../../src/utils/ids-generator.js';

describe('ids-generator', () => {
  it('generates IDs with TYPE-PROY-COMP-SUFFIX shape', () => {
    const id = generateEntityId('ISSUE', 'KVD', 'KVD-PLATFORM');
    expect(id).toMatch(/^ISSUE-KVD-PLATFORM-[0-9A-F]{6}$/);
  });

  it('drops project from component prefix when redundant', () => {
    const id = generateEntityId('ISSUE', 'KVD', 'KVD-PLATFORM');
    expect(id.includes('KVD-KVD')).toBe(false);
  });

  it('parses a canonical entity id', () => {
    const parsed = parseEntityId('ISSUE-KVD-PLATFORM-ABC123');
    expect(parsed).not.toBeNull();
    expect(parsed?.entityType).toBe('ISSUE');
    expect(parsed?.projectId).toBe('KVD');
  });
});

describe('validateForceId', () => {
  it('accepts canonical PRJ ids', () => {
    expect(validateForceId('PRJ', 'PRJ-KVD').ok).toBe(true);
  });
  it('rejects invalid PRJ ids', () => {
    expect(validateForceId('PRJ', 'BAD').ok).toBe(false);
  });
  it('accepts canonical CMP ids', () => {
    expect(validateForceId('CMP', 'CMP-KVD-PLATFORM').ok).toBe(true);
  });
  it('accepts SemVer REL ids', () => {
    expect(validateForceId('REL', 'REL-KVD-PLATFORM-0.1.0-alpha.0').ok).toBe(true);
    expect(validateForceId('REL', 'REL-KVD-1.2.3').ok).toBe(true);
  });
  it('rejects non-SemVer REL ids', () => {
    expect(validateForceId('REL', 'REL-KVD-not-semver').ok).toBe(false);
  });
});

describe('resolveEntityId', () => {
  it('requires force_id for PRJ/CMP/REL', () => {
    const r = resolveEntityId('PRJ', undefined, 'KVD', null);
    expect('ok' in r && r.ok === false).toBe(true);
  });
  it('autogenerates for other types', () => {
    const r = resolveEntityId('ISSUE', undefined, 'KVD', 'KVD-PLATFORM');
    expect('entityId' in r).toBe(true);
  });
});
