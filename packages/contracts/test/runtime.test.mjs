import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';

// The production API loads these source exports with plain Node, without tsx
// or a bundler's extension resolution. Exercise that actual package boundary.
const require = createRequire(import.meta.url);
for (const subpath of ['', '/native-auth', '/commerce-rules', '/feedback-ops', '/app-content', '/wechat-pay', '/vocabulary-live', '/vocabulary-edit']) {
  test(`plain Node can require @icao/contracts${subpath}`, () => {
    assert.equal(typeof require(`@icao/contracts${subpath}`), 'object');
  });
}

test('ESM consumers load the same scope projection as the production API', async () => {
  const { normalizeStudyScope, studyScopeCardIds } = await import('@icao/contracts');
  assert.equal(normalizeStudyScope(undefined), 'selected');
  assert.deepEqual(studyScopeCardIds('listening', {
    cards: [{ id: 'full' }, { id: 'core', studyTier: 1 }, { id: 'quick', studyTier: 2 }],
  }), { all: ['full', 'core', 'quick'], selected: ['core', 'quick'], crash: ['quick'] });
});

test('new reported exam questions do not silently enter selected content, and retired IDs leave new practice only', async () => {
 const {studyScopeCardIds}=await import('@icao/contracts');
 assert.deepEqual(studyScopeCardIds('opi',{cards:[{id:'old-selected',studyTier:2},{id:'new-exam',studyTier:0,examReported:true},{id:'retired',studyTier:2,retired:true}]}),{all:['old-selected','new-exam'],selected:['old-selected'],crash:['old-selected','new-exam']});
});


test('Tianjin is selectable without remapping frozen legacy center labels', async () => {
 const {HOTSPOT_CENTER_NAMES,normalizeHotspotCenter}=await import('@icao/contracts/app-content');
 assert.ok(HOTSPOT_CENTER_NAMES.includes('天津考点'));
 for(const name of ['天津考点','中国民航大 本部','中国民航大学','民航大']) assert.equal(normalizeHotspotCenter(name),'天津考点');
 const legacy=['北京考点','广汉考点','新津考点','绵阳考点','广州考点','新疆考点','西南考点','遂宁考点','深圳考点','上海考点'];
 for(const name of ['考点未注明','国航考点','首都航空','东方飞培','未识别历史名称']) {
  let hash=2166136261;for(const char of name)hash=Math.imul(hash^char.charCodeAt(0),16777619)>>>0;
  assert.equal(normalizeHotspotCenter(name),legacy[hash%legacy.length]);
 }
 assert.equal(normalizeHotspotCenter('中飞院本部'),'广汉考点');
});
