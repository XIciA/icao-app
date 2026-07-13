import { createHash, randomBytes } from 'node:crypto';

import { createClient } from '@supabase/supabase-js';

const apiBase = process.env.API_BASE ?? 'http://icao-api:3101';
const supabaseUrl = process.env.SUPABASE_URL;
const supabasePublicUrl = process.env.SUPABASE_PUBLIC_URL;
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
const secretKey = process.env.SUPABASE_SECRET_KEY;

if (!supabaseUrl || !supabasePublicUrl || !publishableKey || !secretKey) throw new Error('missing_live_verification_configuration');

const image = {
  path: '/question-bank-assets/images/opi/image-questions/image-topic-001.jpg',
  mimeType: 'image/jpeg',
  sizeBytes: 304040,
  checksum: 'a04082e2aa5dbcab371fa3c166e390b0965023a25dbb4ad37dbd5b541f500fbe',
};
const audio = {
  path: '/question-bank-assets/audio/opi/image-questions/image-topic-001-q01.mp3',
  mimeType: 'audio/mpeg',
  sizeBytes: 17765,
  checksum: 'de40f2cabaf049ba9818f5ac2c7bf9985d732e642b89200c7d574973e126a05b',
};

const options = { auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false } };
const client = createClient(supabaseUrl, publishableKey, options);
const admin = createClient(supabaseUrl, secretKey, options);
const suffix = `${Date.now()}-${randomBytes(4).toString('hex')}`;
const email = `image-question-${suffix}@example.test`;
const password = `Icao-${randomBytes(18).toString('base64url')}!7`;
let userId;

function assert(value, message) {
  if (!value) throw new Error(`verification_failed:${message}`);
}

async function api(path, token, headers = {}) {
  return fetch(`${apiBase}${path}`, { headers: { accept: 'application/json', authorization: `Bearer ${token}`, ...headers } });
}

async function fetchResource(expected, token) {
  const response = await api(`/v1/resources/resolve?path=${encodeURIComponent(expected.path)}`, token);
  assert(response.ok, `resource_resolve_${response.status}:${expected.path}`);
  const resolved = (await response.json()).data;
  assert(resolved.publicPath === expected.path, `resource_path:${expected.path}`);
  assert(resolved.mimeType === expected.mimeType, `resource_metadata_mime:${expected.path}`);
  assert(resolved.sizeBytes === expected.sizeBytes, `resource_metadata_size:${expected.path}`);
  assert(resolved.checksum === expected.checksum, `resource_metadata_checksum:${expected.path}`);
  const internalUrl = resolved.url.replace(supabasePublicUrl.replace(/\/$/, ''), supabaseUrl.replace(/\/$/, ''));
  const fileResponse = await fetch(internalUrl);
  assert(fileResponse.ok, `resource_download_${fileResponse.status}:${expected.path}`);
  assert((fileResponse.headers.get('content-type') ?? '').startsWith(expected.mimeType), `resource_download_mime:${expected.path}`);
  const bytes = Buffer.from(await fileResponse.arrayBuffer());
  assert(bytes.length === expected.sizeBytes, `resource_download_size:${expected.path}`);
  assert(createHash('sha256').update(bytes).digest('hex') === expected.checksum, `resource_download_checksum:${expected.path}`);
  return { mimeType: expected.mimeType, sizeBytes: bytes.length, checksum: 'ok' };
}

try {
  const signup = await client.auth.signUp({ email, password });
  if (signup.error) throw signup.error;
  assert(signup.data.session?.access_token, 'signup_session_missing');
  assert(signup.data.user?.id, 'signup_user_missing');
  userId = signup.data.user.id;
  const token = signup.data.session.access_token;

  const opiResponse = await api('/v1/question-banks/opi', token);
  assert(opiResponse.ok, `opi_release_${opiResponse.status}`);
  const etag = opiResponse.headers.get('etag');
  const release = (await opiResponse.json()).data;
  assert(release.version === 2, `opi_version:${release.version}`);
  assert(release.dataset.declaredTopicCount === 144, `opi_topics:${release.dataset.declaredTopicCount}`);
  assert(release.dataset.declaredCardCount === 1356, `opi_cards:${release.dataset.declaredCardCount}`);
  assert(release.dataset.categories.length === 8, `opi_categories:${release.dataset.categories.length}`);
  const imageCategory = release.dataset.categories.find((category) => category.id === 'opi-category-08');
  assert(imageCategory?.topics.length === 23, `image_topics:${imageCategory?.topics.length}`);
  const imageCards = imageCategory.topics.flatMap((topic) => topic.cards).filter((card) => card.kind === 'image');
  const questionCards = imageCategory.topics.flatMap((topic) => topic.cards).filter((card) => card.kind !== 'image');
  assert(imageCards.length === 23, `image_cards:${imageCards.length}`);
  assert(questionCards.length === 64, `image_question_cards:${questionCards.length}`);
  assert(etag === `"${release.checksum}"`, 'opi_etag');
  const notModified = await api('/v1/question-banks/opi', token, { 'if-none-match': etag });
  assert(notModified.status === 304, `opi_not_modified:${notModified.status}`);

  const imageResult = await fetchResource(image, token);
  const audioResult = await fetchResource(audio, token);

  const vocabularyResponse = await api('/v1/vocabulary', token);
  assert(vocabularyResponse.ok, `vocabulary_regression:${vocabularyResponse.status}`);

  console.log(JSON.stringify({
    opi: { version: release.version, categories: 8, topics: 144, cards: 1356, etag: 'ok' },
    imageQuestions: { topics: 23, imageCards: 23, questionCards: 64 },
    image: imageResult,
    audio: audioResult,
    vocabularyRegression: 'ok',
  }));
} finally {
  if (userId) {
    const deletion = await admin.auth.admin.deleteUser(userId);
    if (deletion.error) throw deletion.error;
  }
}
