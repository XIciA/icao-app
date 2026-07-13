import { createHash, randomBytes } from 'node:crypto';

import { createClient } from '@supabase/supabase-js';

const apiBase = process.env.API_BASE ?? 'http://127.0.0.1:3101';
const supabaseUrl = process.env.SUPABASE_URL;
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
const secretKey = process.env.SUPABASE_SECRET_KEY;
const expectedChecksums = process.env.EXPECTED_BANK_CHECKSUMS
  ? JSON.parse(process.env.EXPECTED_BANK_CHECKSUMS)
  : undefined;
const expectedCounts = { listening: 631, sentences900: 900, radiotelephony: 1851, opi: 1269, storytelling: 296 };
const restoredPath = '/question-bank-assets/audio/listening/main/454.mp3';
const restoredChecksum = 'a0722b82f2d5a22cba9a0fad0f8b7f06d98eab8d596691eedcbde6e74f20067f';

if (!supabaseUrl || !publishableKey || !secretKey) throw new Error('missing_live_verification_configuration');

const options = { auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false } };
const client = createClient(supabaseUrl, publishableKey, options);
const admin = createClient(supabaseUrl, secretKey, options);
const suffix = `${Date.now()}-${randomBytes(4).toString('hex')}`;
const email = `content-${suffix}@example.test`;
const password = `Icao-${randomBytes(18).toString('base64url')}!7`;
let userId;

function assert(value, message) {
  if (!value) throw new Error(`verification_failed:${message}`);
}

function expectedAudio(bankId, cardId) {
  let match;
  if (bankId === 'listening' && (match = cardId.match(/^listening-main-(\d{3})$/))) return `/question-bank-assets/audio/listening/main/${match[1]}.mp3`;
  if (bankId === 'sentences900' && (match = cardId.match(/^sentence900-main-(\d{3})$/))) return `/question-bank-assets/audio/sentence900/main/${match[1]}.mp3`;
  if (bankId === 'radiotelephony' && (match = cardId.match(/^atc-scenario-\d{4}-card-main-(\d{3,4})$/))) return `/question-bank-assets/audio/radiotelephony/main/${match[1]}.mp3`;
  if (bankId === 'storytelling' && (match = cardId.match(/^story-(koala|kongguan|wing)-(\d{3})$/))) return `/question-bank-assets/audio/storytelling/${match[1]}/${match[2]}.mp3`;
  throw new Error(`unsupported_stable_audio_id:${bankId}:${cardId}`);
}

async function api(path, accessToken) {
  const response = await fetch(`${apiBase}${path}`, { headers: { accept: 'application/json', authorization: `Bearer ${accessToken}` } });
  const body = await response.json();
  if (!response.ok) throw new Error(`api_${response.status}:${body?.error?.code ?? 'unknown'}`);
  return { data: body.data, etag: response.headers.get('etag') };
}

try {
  const signup = await client.auth.signUp({ email, password });
  if (signup.error) throw signup.error;
  assert(signup.data.session?.access_token, 'signup_session_missing');
  assert(signup.data.user?.id, 'signup_user_missing');
  userId = signup.data.user.id;
  const accessToken = signup.data.session.access_token;

  const list = await api('/v1/question-banks', accessToken);
  assert(list.data.length === 5, 'bank_list_count');
  const results = {};
  for (const bankId of Object.keys(expectedCounts)) {
    const release = await api(`/v1/question-banks/${bankId}`, accessToken);
    assert(release.data.bankId === bankId, `${bankId}_response_id`);
    assert(release.data.version === 1, `${bankId}_version`);
    if (expectedChecksums) assert(release.data.checksum === expectedChecksums[bankId], `${bankId}_checksum`);
    assert(release.etag === `"${release.data.checksum}"`, `${bankId}_etag`);
    const cards = release.data.dataset.categories.flatMap((category) => category.topics.flatMap((topic) => topic.cards));
    assert(cards.length === expectedCounts[bankId], `${bankId}_card_count`);
    if (bankId === 'opi') assert(cards.every((card) => !card.audio), 'opi_local_audio_present');
    else assert(cards.every((card) => card.audio === expectedAudio(bankId, card.id)), `${bankId}_audio_mapping`);
    results[bankId] = { cards: cards.length, checksum: release.data.checksum, etag: release.etag };
  }

  const resource = await api(`/v1/resources/resolve?path=${encodeURIComponent(restoredPath)}`, accessToken);
  assert(resource.data.objectKey === 'v1/audio/listening/main/454.mp3', 'restored_object_key');
  assert(resource.data.checksum === restoredChecksum, 'restored_resource_checksum');
  assert(resource.data.sizeBytes === 128300, 'restored_resource_size');
  const downloadUrl = new URL(resource.data.url);
  const internalSupabaseUrl = new URL(supabaseUrl);
  downloadUrl.protocol = internalSupabaseUrl.protocol;
  downloadUrl.host = internalSupabaseUrl.host;
  const audioResponse = await fetch(downloadUrl);
  assert(audioResponse.ok, `restored_audio_http_${audioResponse.status}`);
  const bytes = Buffer.from(await audioResponse.arrayBuffer());
  assert(bytes.length === 128300, 'restored_audio_download_size');
  assert(createHash('sha256').update(bytes).digest('hex') === restoredChecksum, 'restored_audio_download_checksum');

  process.stdout.write(`${JSON.stringify({ banks: results, resource454: { bytes: bytes.length, checksum: restoredChecksum }, verifiedAudioCards: 3678 })}\n`);
} finally {
  if (userId) {
    const deletion = await admin.auth.admin.deleteUser(userId);
    if (deletion.error) throw deletion.error;
  }
}
