import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareDisplayTitleDelta } from './prepare-display-title-delta.mjs';
const source = () => ({ banks: [{ bankId: 'opi', version: 31, checksum: 'a'.repeat(64), payload: { id: 'opi', extra: 'live metadata', categories: [{ id: 'category', topics: [{ id: 'topic', name: 'Figure 1', cards: [{ id: 'card', taskTitle: 'Figure 1-1', audio: 'live-revised.mp3', audioText: 'Later operational question?', reportedPrompts: { newer: ['New feedback?'] } }, { id: 'later', taskTitle: '后续新增题' }] }] }] } }], appContent: { version: 31, payload: { untouched: true } } });
const topics = [{ id: 'topic', before: 'Figure 1', after: '机场运行' }];
const cards = { 'card#taskTitle': { before: 'Figure 1-1', after: '机场运行-1' } };
test('only approved display fields change; later data and source remain intact', () => {
 const input = source(), before = structuredClone(input), { draft, report } = prepareDisplayTitleDelta(input, topics, cards);
 assert.deepEqual(input, before); assert.equal(report.changed.length, 2);
 const expected = structuredClone(input.banks[0].payload); expected.categories[0].topics[0].name = '机场运行'; expected.categories[0].topics[0].cards[0].taskTitle = '机场运行-1';
 assert.deepEqual(draft.banks[0].payload, expected); assert.equal(draft.banks[0].baseChecksum, 'a'.repeat(64)); assert.equal(draft.banks[0].version, undefined); assert.equal(draft.hotspotUpdates, undefined);
});
test('a later title edit blocks the candidate; no partial overwrite', () => {
 const input = source(); input.banks[0].payload.categories[0].topics[0].name = '运营团队新标题';
 const result = prepareDisplayTitleDelta(input, topics, cards); assert.equal(result.draft, null); assert.equal(result.report.conflicts[0].reason, 'live_field_changed');
});
test('repeated runs skip already-applied values', () => {
 const input = source(); input.banks[0].payload = prepareDisplayTitleDelta(input, topics, cards).draft.banks[0].payload;
 const result = prepareDisplayTitleDelta(input, topics, cards); assert.equal(result.report.alreadyApplied.length, 2); assert.deepEqual(result.draft.banks, []);
});
test('missing IDs and non-display fields cannot be silently published', () => {
 const input = source(); input.banks[0].payload.categories[0].topics[0].cards = [];
 assert.equal(prepareDisplayTitleDelta(input, topics, cards).draft, null);
 assert.throws(() => prepareDisplayTitleDelta(source(), topics, { 'card#audioText': { before: 'x', after: 'y' } }), /unapproved_display_field/);
});
