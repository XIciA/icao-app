import { describe, expect, it } from 'vitest';
import { mergeCardProgress } from './card-progress';
const state = { visited: true, completed: true, note: '', updatedAt: '2026-11-03T00:00:00.000Z', lastVisitedAt: '2026-11-03T00:00:00.000Z' };
const now = Date.parse('2026-11-03T02:00:00.000Z');
describe('cross-device cumulative progress', () => {
  it('merges a recent visit from an older device version without replacing mutable answers', () => {
    expect(mergeCardProgress({ ...state, selectedChoiceIndex: 2 }, { ...state, selectedChoiceIndex: 1, lastVisitedAt: '2026-11-03T01:00:00.000Z' }, false, now))
      .toMatchObject({ completed: true, selectedChoiceIndex: 2, lastVisitedAt: '2026-11-03T01:00:00.000Z' });
  });
  it('never moves cumulative progress or the resume time backwards for a newer device version', () => {
    expect(mergeCardProgress(state, { ...state, completed: false, visited: false, lastVisitedAt: '2026-11-02T23:00:00.000Z' }, true, now)).toMatchObject(state);
  });
  it('preserves the resume field for an old installed client and bounds a future device clock', () => {
    expect(mergeCardProgress(state, { ...state, lastVisitedAt: undefined }, true, now).lastVisitedAt).toBe(state.lastVisitedAt);
    expect(mergeCardProgress(state, { ...state, lastVisitedAt: '2099-01-01T00:00:00.000Z' }, false, now).lastVisitedAt).toBe(new Date(now).toISOString());
  });
});
