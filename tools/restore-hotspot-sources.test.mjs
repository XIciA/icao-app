import { test } from 'node:test';
import assert from 'node:assert/strict';
import { restoreHotspotSources } from './restore-hotspot-sources.mjs';

const topic = { topicId: 'weather', topicTitle: '气象', cardIds: ['a', 'b'] };
const old = { version: 31, legal: { current: 'old' }, hotspots: { briefs: [{ id: 'day', date: '2026-10-16', centers: ['甲', '乙'], topics: [topic], sources: [
  { id: 'one', kind: 'feedback', centers: ['甲'], topics: [{ ...topic, cardIds: ['a'] }] },
  { id: 'two', kind: 'feedback', centers: ['乙'], topics: [{ ...topic, cardIds: ['b'] }] },
] }] } };
const current = structuredClone(old);
current.version = 32; current.legal.current = 'new payment text';
delete current.hotspots.briefs[0].sources;
test('restores the exact historical center/question split while preserving newer content', () => {
  const { payload, restored } = restoreHotspotSources(current, old);
  assert.deepEqual(payload.hotspots.briefs[0].sources, old.hotspots.briefs[0].sources);
  assert.deepEqual(payload.legal, current.legal);
  assert.equal(payload.version, 32);
  assert.deepEqual(restored, ['day']);
  assert.deepEqual(restoreHotspotSources(payload, old).restored, []);
});
test('never drops a newer question or invents a center when history no longer matches', () => {
  const changed = structuredClone(current); changed.hotspots.briefs[0].topics[0].cardIds.push('new');
  assert.throws(() => restoreHotspotSources(changed, old), /requires_relation_merge/);
});
