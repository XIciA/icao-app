import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';

// The production API loads these source exports with plain Node, without tsx
// or a bundler's extension resolution. Exercise that actual package boundary.
const require = createRequire(import.meta.url);
for (const subpath of ['', '/native-auth', '/commerce-rules', '/feedback-ops', '/app-content', '/wechat-pay']) {
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
