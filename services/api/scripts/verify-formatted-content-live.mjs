import assert from 'node:assert/strict';
import { createHash, createHmac, randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { createClient } from '@supabase/supabase-js';
import postgres from 'postgres';
import { createTemporaryPhoneAuthUser, cleanupTemporaryBusinessAccount, lifetimeBenefitAccountContext } from './live-verifier-account-fixture.mjs';

const require = createRequire(import.meta.url);
const { formatRevisions } = require('../dist/src/sync/question-bank-format-revisions.js');
const database = postgres(process.env.DATABASE_URL, { max: 1, prepare: false });
const options = { auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false } };
const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, options);
const auth = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_PUBLISHABLE_KEY, options);
const apiBase = 'https://api.readyoufife.com';
let accountId, authUserId, token, result, failure;
async function api(path, body) {
  const response = await fetch(apiBase + path, { method: body ? 'POST' : 'GET', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(30_000) });
  const value = await response.json();
  assert(response.ok, `api_${response.status}:${value.error?.code}`);
  return value.data;
}
try {
  const password = `Icao-${randomBytes(18).toString('base64url')}!7`;
  const identity = await createTemporaryPhoneAuthUser({ admin, password });
  authUserId = accountId = identity.authUserId;
  await database`insert into accounts (id, status) values (${accountId}, 'active')`;
  const subjectHash = createHmac('sha256', process.env.ACCOUNT_IDENTITY_HASH_SECRET).update(`account-identity-v1\0phone\0${identity.phone}`).digest('hex');
  await database`insert into account_identities (account_id, auth_user_id, provider, subject_hash) values (${accountId}, ${authUserId}, 'phone', ${subjectHash})`;
  const session = await auth.auth.signInWithPassword({ phone: identity.phone, password });
  if (session.error) throw session.error;
  token = session.data.session.access_token;
  assert.equal((await api('/v1/me')).id, accountId);
  const releases = await api('/v1/question-banks');
  assert.equal(releases.length, 5);
  let topics = 0, media = 0;
  for (const release of releases) {
    assert.equal(release.version, 26);
    const catalog = await api(`/v1/question-banks/${release.bankId}`);
    assert.equal(catalog.checksum, release.checksum);
    const category = catalog.dataset.categories.find(category => category.topics.some(topic => topic.cards.length));
    const topic = category.topics.find(topic => topic.cards.length);
    const loaded = await api(`/v1/question-banks/${release.bankId}/categories/${category.id}/topics/${topic.id}?version=26&checksum=${release.checksum}`);
    assert.deepEqual(loaded.topic.cards.map(card => card.id), topic.cards.map(card => card.id));
    const card = loaded.topic.cards.find(card => card.audio && !card.retired);
    assert(card);
    if (release.bankId === 'storytelling') {
      assert.match(card.audioText, /\n\n\d+ words$/u);
      assert(!card.audioText.split('\n\n')[0].includes('\n'));
    }
    const resolved = await api(`/v1/resources/resolve?path=${encodeURIComponent(card.audio)}`);
    const audio = await fetch(resolved.url, { signal: AbortSignal.timeout(30_000) });
    assert(audio.ok);
    assert.equal(createHash('sha256').update(Buffer.from(await audio.arrayBuffer())).digest('hex'), resolved.checksum);
    topics += 1; media += 1;
  }
  // Verify that an old client's queued annotation is rebased through the real
  // sync endpoint, with the same note, tags, quote and number of highlights.
  const [key, revision] = Object.entries(formatRevisions).find(([, value]) => value.runs.length);
  const [bankId, categoryId, topicId, cardId, blockId, fingerprint] = key.split(':');
  const run = revision.runs[0], updatedAt = new Date().toISOString();
  const document = { version: 2, legacyImported: true, tagDefinitions: [{ id: 'good', label: '好题', color: 'green' }], highlightDefinitions: [{ id: 'green', label: '重点', color: 'green' }], entries: { sample: { bankId, categoryId, topicId, cardId, note: 'format verification note', tagIds: ['good'], updatedAt, highlights: [{ blockId, wordIndex: run[0], contentFingerprint: fingerprint, colorId: 'green', quote: 'original quote', sentence: 'original context' }] } } };
  const pushed = await api('/v1/sync/push', { mutations: [{ mutationId: `format-probe-${randomBytes(8).toString('hex')}`, kind: 'document', payload: { documentKey: 'annotations', document, version: 1, updatedAt } }] });
  const stored = (await database`select payload from user_documents where user_id = ${accountId} and document_key = 'annotations'`)[0].payload.entries.sample;
  assert.equal(stored.note, document.entries.sample.note);
  assert.deepEqual(stored.tagIds, ['good']);
  assert.equal(stored.highlights.length, 1);
  assert.equal(stored.highlights[0].wordIndex, run[1]);
  assert.equal(stored.highlights[0].contentFingerprint, revision.fingerprint);
  result = { releaseVersion: 26, banks: releases.length, topicReadbacks: topics, signedAudioChecksums: media, legacyAnnotationUpload: 'verified' };
} catch (error) { failure = error; }
const errors = await cleanupTemporaryBusinessAccount({ accountId, authUserId, admin, database, errorPrefix: 'formatted_content', lifetimeClaimContextDigest: accountId ? lifetimeBenefitAccountContext(accountId, process.env.IDENTITY_BENEFIT_DIGEST_SECRET) : undefined });
await database.end({ timeout: 5 });
if (failure || errors.length) throw new AggregateError([...(failure ? [failure] : []), ...errors], 'formatted_content_live_verification_failed');
console.log(JSON.stringify({ ...result, temporaryAccountCleanup: 'verified' }));
