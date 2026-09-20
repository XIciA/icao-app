import { describe, expect, it } from 'vitest';
import { planNativeContentPublication } from './native-content-release.mjs';
const ids = ['listening', 'sentences900', 'radiotelephony', 'opi', 'storytelling'];
const release = { version: 14, banks: ids.map(id => ({ id, version: 14, checksum: `${id}-new`, payload: { id } })) };
const unchanged = { bank_id: 'sentences900', version: 13, checksum: 'sentences900-new' };
const rows = [unchanged, ...ids.filter(id => id !== 'sentences900').map(id => ({ bank_id: id, version: 12, checksum: `${id}-old` }))];
describe('content-addressed publication and history reset', () => {
  it('retains an unchanged bank while publishing the other four atomically', () => {
    const plan = planNativeContentPublication(release, rows, true);
    expect(plan.banks.map(b => b.version)).toEqual([14, 13, 14, 14, 14]);
    expect(plan.resetHistory).toBe(true);
    expect(release.banks.map(b => b.version)).toEqual([14,14,14,14,14]);
  });
  it('does not clear new work when retrying a mixed-version completed publication', () => {
    const completed = planNativeContentPublication(release, rows, true).banks.map(b => ({bank_id:b.id,version:b.version,checksum:b.checksum}));
    expect(planNativeContentPublication(release, [...rows, ...completed], true).resetHistory).toBe(false);
  });
  it('rejects a conflicting requested version even if the bytes exist in another version', () => {
    expect(() => planNativeContentPublication(release, [...rows, {bank_id:'sentences900',version:14,checksum:'different'}], true)).toThrow('content_release_version_immutable');
  });
  it('rejects a partially published new release before clearing history', () => {
    expect(() => planNativeContentPublication(release, [...rows, {bank_id:'listening',version:14,checksum:'listening-new'}], true)).toThrow('history_reset_partial_version');
  });
  it('does not reset history for a no-content-change release or ordinary publication', () => {
    const same = release.banks.map(b => ({bank_id:b.id,version:10,checksum:b.checksum}));
    expect(planNativeContentPublication(release,same,true).resetHistory).toBe(false);
    expect(planNativeContentPublication(release,rows).resetHistory).toBe(false);
  });
  it('requires all banks for a history reset but allows subset publication without one', () => {
    const partial = {...release,banks:release.banks.slice(1,2)};
    expect(() => planNativeContentPublication(partial,rows,true)).toThrow('history_reset_requires_complete_release');
    expect(planNativeContentPublication(partial,rows).banks[0].version).toBe(13);
  });
});
