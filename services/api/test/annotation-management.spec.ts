import { describe, expect, it } from 'vitest';
import { normalizeAnnotationDefinitions, preserveManagedAnnotations } from '@icao/contracts/annotation-management';

const definitions = [{ id: 'good', label: '自定义重点', color: 'green' }, { id: 'extra', label: '复习', color: 'purple' }];
const prior = { version: 2, tagDefinitions: definitions, highlightDefinitions: [{ id: 'pen', label: '难点', color: 'teal' }],
  deletedDefinitions: { tags: ['memory'], highlights: ['red'] }, entries: { q: { tagIds: ['extra'], highlights: [{ blockId: 'question', wordIndex: 0, colorId: 'pen' }], note: '笔记' } } };
describe('managed annotations compatibility', () => {
  it('migrates duplicate colors without merging identities or labels', () => {
    const result = normalizeAnnotationDefinitions([{ id: 'a', label: '好题', color: 'green' }, { id: 'b', label: 'ok', color: 'green' }], []);
    expect(result.map((d) => d.id)).toEqual(['a', 'b']); expect(result[0]!.color).not.toBe(result[1]!.color);
    expect(result[1]!.label).toBe('ok');
  });
  it('respects empty saved definitions and tombstones instead of restoring defaults', () => {
    expect(normalizeAnnotationDefinitions([], [{ id: 'good', label: '好题', color: 'green' }])).toEqual([]);
    expect(normalizeAnnotationDefinitions(definitions, [], ['good']).map((d) => d.id)).toEqual(['extra']);
  });
  it('protects v2 names, unknown-color references and deletions from old clients', () => {
    const result = preserveManagedAnnotations(prior, { version: 1,
      tagDefinitions: [{ id: 'good', label: '好题', color: 'green' }, { id: 'memory', label: '记忆', color: 'yellow' }], highlightDefinitions: [],
      entries: { q: { tagIds: ['memory'], highlights: [], note: '编辑后的笔记' } } });
    expect(result.tagDefinitions).toEqual(definitions.map((d) => ({ ...d, builtIn: false })));
    expect(result.entries).toEqual({ q: { tagIds: ['extra'], highlights: prior.entries.q.highlights, note: '编辑后的笔记' } });
    expect(result.version).toBe(2);
  });
  it('deletes only the selected definition and references, preserving notes and other marks', () => {
    const result = preserveManagedAnnotations(prior, { ...prior, tagDefinitions: [definitions[0]], deletedDefinitions: { tags: ['extra'], highlights: [] } });
    expect(result.deletedDefinitions).toEqual({ tags: ['memory', 'extra'], highlights: ['red'] });
    expect(result.entries).toEqual({ q: { ...prior.entries.q, tagIds: [] } });
  });
  it('allows reuse of a deleted color under a new identity without restoring old references', () => {
    const result = preserveManagedAnnotations(prior, { ...prior, tagDefinitions: [{ id: 'new', label: '新分类', color: 'purple' }], deletedDefinitions: { tags: ['extra', 'good'], highlights: [] } });
    expect((result.entries as typeof prior.entries).q.tagIds).toEqual([]);
  });
});
