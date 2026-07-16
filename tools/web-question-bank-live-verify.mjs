import { createHash, randomBytes } from 'node:crypto';
import { Buffer } from 'node:buffer';

import { createClient } from '@supabase/supabase-js';

const apiBase = (process.env.API_BASE ?? 'http://127.0.0.1:3101').replace(/\/$/, '');
const supabaseUrl = process.env.SUPABASE_URL;
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
const secretKey = process.env.SUPABASE_SECRET_KEY;

if (!supabaseUrl || !publishableKey || !secretKey) {
  throw new Error('missing_live_verification_configuration');
}

const expectedBanks = {
  listening: {
    version: 5,
    cards: 1223,
    topics: 4,
    checksum: '6dcce1792d23286fd2943ada8015c4592776ae67474227f1e974f75e46b1d609',
  },
  opi: {
    version: 2,
    cards: 1356,
    checksum: '454409b93572878093c8f18974e9e1315a427a204d4560bdfceb6af3b1c3119e',
  },
  radiotelephony: {
    version: 6,
    cards: 3218,
    topics: 186,
    checksum: 'bde49b9b44e2c3b5bc562d816748888e467cd54490114f3780807cab513f2547',
  },
  sentences900: {
    version: 1,
    cards: 900,
    checksum: 'b5312ac75f8cf3bae53d7d31ebb6531dbfdfa7830ac10da9a7d396349637fa5e',
  },
  storytelling: {
    version: 5,
    cards: 436,
    topics: 4,
    checksum: '8a8b1989c7a81c593da3629b46d6172827f51151d4fd623cc21d6fbe339d7349',
  },
};

const representativeCards = {
  listening: {
    id: 'listening-main-633',
    taskTitle: '10s航空英语-246',
    audio: '/question-bank-assets/audio/listening/web-v5/pepec-listening-s01-section-01-q02.mp3',
  },
  radiotelephony: {
    id: 'atc-scenario-0108-card-main-1852',
    taskTitle: 'AFR 113-1',
    audio: '/question-bank-assets/audio/radiotelephony/web-v6/pepec-radiotelephony-001-afr113-q01.mp3',
  },
  storytelling: {
    id: 'story-pepec-0001',
    taskTitle: '飞行ICAO-基础题库-148',
    audio: '/question-bank-assets/audio/storytelling/web-v5/pepec-story-0001.mp3',
  },
};

const representativeResources = [
  {
    publicPath: representativeCards.listening.audio,
    objectKey: 'v5/audio/listening/web-v5/pepec-listening-s01-section-01-q02.mp3',
    sizeBytes: 120428,
    checksum: 'dd99b705fbe47c9d760fce1e45f64ec62c6e909d52f68fc2e107853866f802ef',
  },
  {
    publicPath: representativeCards.radiotelephony.audio,
    objectKey: 'v6/audio/radiotelephony/web-v6/pepec-radiotelephony-001-afr113-q01.mp3',
    sizeBytes: 44324,
    checksum: '03daf99e4cbbc611d921659866fb3a84a9b59c6967de6151a36e34c809b7e83e',
  },
  {
    publicPath: representativeCards.storytelling.audio,
    objectKey: 'v5/audio/storytelling/web-v5/pepec-story-0001.mp3',
    sizeBytes: 198764,
    checksum: '1e4ef07e570ec1601c13a14ddbde1397bdebd6a7eaa779a0a76883360342d1b3',
  },
  {
    publicPath: '/question-bank-assets/audio/listening/main/454.mp3',
    objectKey: 'v1/audio/listening/main/454.mp3',
    sizeBytes: 128300,
    checksum: 'a0722b82f2d5a22cba9a0fad0f8b7f06d98eab8d596691eedcbde6e74f20067f',
  },
];

const options = { auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false } };
const client = createClient(supabaseUrl, publishableKey, options);
const admin = createClient(supabaseUrl, secretKey, options);
const suffix = `${Date.now()}-${randomBytes(4).toString('hex')}`;
const email = `web-content-v6-${suffix}@example.test`;
const password = `Icao-${randomBytes(18).toString('base64url')}!7`;
let userId;
let report;

function assert(value, message) {
  if (!value) throw new Error(`verification_failed:${message}`);
}

function flattenDataset(dataset) {
  const cards = [];
  let topics = 0;
  for (const category of dataset.categories) {
    for (const topic of category.topics) {
      topics += 1;
      for (const card of topic.cards) cards.push({ ...card, categoryId: category.id, topicId: topic.id });
    }
  }
  return { cards, topics };
}

async function api(path, accessToken, init = {}) {
  const response = await fetch(`${apiBase}${path}`, {
    ...init,
    headers: {
      accept: 'application/json',
      authorization: `Bearer ${accessToken}`,
      ...init.headers,
    },
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : undefined;
  if (!response.ok) throw new Error(`api_${response.status}:${body?.error?.code ?? 'unknown'}`);
  return { body, response, text };
}

function internalDownloadUrl(publicUrl) {
  const target = new URL(publicUrl);
  const internal = new URL(supabaseUrl);
  target.protocol = internal.protocol;
  target.host = internal.host;
  return target;
}

try {
  const healthResponse = await fetch(`${apiBase}/health/ready`, { headers: { accept: 'application/json' } });
  const health = await healthResponse.json();
  assert(healthResponse.ok, 'health_http');
  assert(health.data?.service === 'icao-api' && health.data?.status === 'ok' && health.data?.database === 'ok', 'health_body');

  const signup = await client.auth.signUp({ email, password });
  if (signup.error) throw signup.error;
  assert(signup.data.session?.access_token, 'signup_session_missing');
  assert(signup.data.user?.id, 'signup_user_missing');
  userId = signup.data.user.id;
  const accessToken = signup.data.session.access_token;

  const listResult = await api('/v1/question-banks', accessToken);
  const list = listResult.body.data;
  assert(list.length === 5, 'active_bank_count');
  assert(new Set(list.map((bank) => bank.bankId)).size === 5, 'active_bank_ids_unique');

  const bankResults = {};
  let totalCards = 0;
  for (const [bankId, expected] of Object.entries(expectedBanks)) {
    const result = await api(`/v1/question-banks/${bankId}`, accessToken);
    const release = result.body.data;
    const etag = `"${expected.checksum}"`;
    assert(release.bankId === bankId, `${bankId}_response_id`);
    assert(release.version === expected.version, `${bankId}_version`);
    assert(release.checksum === expected.checksum, `${bankId}_checksum`);
    assert(result.response.headers.get('etag') === etag, `${bankId}_etag`);

    const flattened = flattenDataset(release.dataset);
    assert(flattened.cards.length === expected.cards, `${bankId}_card_count`);
    if (expected.topics !== undefined) assert(flattened.topics === expected.topics, `${bankId}_topic_count`);
    totalCards += flattened.cards.length;

    const notModified = await fetch(`${apiBase}/v1/question-banks/${bankId}`, {
      headers: { accept: 'application/json', authorization: `Bearer ${accessToken}`, 'if-none-match': etag },
    });
    assert(notModified.status === 304, `${bankId}_not_modified_status`);
    assert((await notModified.text()) === '', `${bankId}_not_modified_body`);

    const sampleExpectation = representativeCards[bankId];
    if (sampleExpectation) {
      const sample = flattened.cards.find((card) => card.id === sampleExpectation.id);
      assert(sample, `${bankId}_sample_missing`);
      assert(sample.taskTitle === sampleExpectation.taskTitle, `${bankId}_sample_title`);
      assert(sample.audio === sampleExpectation.audio, `${bankId}_sample_audio`);
      assert(typeof sample.audioText === 'string' && sample.audioText.length > 0, `${bankId}_sample_audio_text`);
      assert(typeof sample.audioTextZh === 'string' && sample.audioTextZh.length > 0, `${bankId}_sample_audio_text_zh`);
      if (bankId === 'listening') {
        assert(Array.isArray(sample.choices) && sample.choices.length === 4, 'listening_sample_choices');
        assert(Number.isInteger(sample.correctChoiceIndex) && sample.correctChoiceIndex >= 0 && sample.correctChoiceIndex < 4, 'listening_sample_correct_index');
        const label = String.fromCharCode(65 + sample.correctChoiceIndex);
        assert(sample.referenceText === `正确答案：${label}. ${sample.choices[sample.correctChoiceIndex]}`, 'listening_sample_reference');
      }
      if (bankId === 'radiotelephony') {
        assert(typeof sample.referenceText === 'string' && sample.referenceText.length > 0, 'radiotelephony_sample_reference');
        assert(typeof sample.referenceTextZh === 'string' && sample.referenceTextZh.length > 0, 'radiotelephony_sample_reference_zh');
      }
    }

    bankResults[bankId] = {
      cards: flattened.cards.length,
      topics: flattened.topics,
      version: release.version,
      checksum: release.checksum,
      etag,
      notModified: 304,
    };
  }
  assert(totalCards === 7133, 'total_card_count');

  const resourceResults = [];
  for (const expected of representativeResources) {
    const resolved = await api(`/v1/resources/resolve?path=${encodeURIComponent(expected.publicPath)}`, accessToken);
    const resource = resolved.body.data;
    assert(resource.objectKey === expected.objectKey, `${expected.objectKey}_object_key`);
    assert(resource.checksum === expected.checksum, `${expected.objectKey}_checksum`);
    assert(resource.sizeBytes === expected.sizeBytes, `${expected.objectKey}_size`);
    assert(resource.mimeType === 'audio/mpeg', `${expected.objectKey}_mime`);

    const downloadUrl = internalDownloadUrl(resource.url);
    const fullResponse = await fetch(downloadUrl);
    assert(fullResponse.status === 200, `${expected.objectKey}_download_status`);
    const bytes = Buffer.from(await fullResponse.arrayBuffer());
    assert(bytes.length === expected.sizeBytes, `${expected.objectKey}_download_size`);
    assert(createHash('sha256').update(bytes).digest('hex') === expected.checksum, `${expected.objectKey}_download_checksum`);

    const rangeResponse = await fetch(downloadUrl, { headers: { range: 'bytes=0-1023' } });
    assert(rangeResponse.status === 206, `${expected.objectKey}_range_status`);
    assert((await rangeResponse.arrayBuffer()).byteLength === Math.min(1024, expected.sizeBytes), `${expected.objectKey}_range_size`);
    resourceResults.push({ ...expected, downloadStatus: 200, rangeStatus: 206 });
  }

  report = {
    status: 'web-question-bank-v6-live-verified',
    verifiedAt: new Date().toISOString(),
    health: health.data,
    banks: bankResults,
    totalCards,
    representativeCards,
    resources: resourceResults,
  };
} finally {
  if (userId) {
    const deletion = await admin.auth.admin.deleteUser(userId);
    if (deletion.error) throw deletion.error;
  }
}

process.stdout.write(`${JSON.stringify({ ...report, temporaryUserDeleted: true })}\n`);
