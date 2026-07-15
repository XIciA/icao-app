import { randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const apiBase = process.env.API_BASE ?? 'http://icao-api:3101';
const supabaseUrl = process.env.SUPABASE_URL;
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
const secretKey = process.env.SUPABASE_SECRET_KEY;
if (!supabaseUrl || !publishableKey || !secretKey) throw new Error('missing_verification_configuration');

const options = { auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false } };
const client = createClient(supabaseUrl, publishableKey, options);
const admin = createClient(supabaseUrl, secretKey, options);
const suffix = `${Date.now()}-${randomBytes(4).toString('hex')}`;
const email = `listening-v4-${suffix}@example.test`;
const password = `Icao-${randomBytes(18).toString('base64url')}!7`;
let userId;

const request = (path, token, init = {}) => fetch(`${apiBase}${path}`, {
  ...init,
  headers: { accept: 'application/json', authorization: `Bearer ${token}`, ...init.headers },
});

try {
  const signup = await client.auth.signUp({ email, password });
  if (signup.error || !signup.data.session || !signup.data.user) throw signup.error ?? new Error('signup_failed');
  userId = signup.data.user.id;
  const token = signup.data.session.access_token;

  const listResponse = await request('/v1/question-banks', token);
  const listBody = await listResponse.json();
  if (!listResponse.ok) throw new Error(`list_failed:${listResponse.status}`);
  const listeningSummary = listBody.data.find((item) => item.bankId === 'listening');

  const releaseResponse = await request('/v1/question-banks/listening', token);
  const etag = releaseResponse.headers.get('etag');
  const releaseBody = await releaseResponse.json();
  if (!releaseResponse.ok || !etag) throw new Error(`release_failed:${releaseResponse.status}`);
  const release = releaseBody.data;

  const cachedResponse = await request('/v1/question-banks/listening', token, { headers: { 'if-none-match': etag } });
  if (cachedResponse.status !== 304) throw new Error(`etag_failed:${cachedResponse.status}`);

  const samples = release.dataset.categories.map((category) => {
    const card = category.topics[0].cards[0];
    return {
      categoryId: category.id,
      cardId: card.id,
      hasAudioText: typeof card.audioText === 'string' && card.audioText.length > 0,
      hasAudioTextZh: typeof card.audioTextZh === 'string' && card.audioTextZh.length > 0,
      choices: card.choices.length,
      correctChoiceIndex: card.correctChoiceIndex,
      referenceMatches: card.referenceText === `正确答案：${String.fromCharCode(65 + card.correctChoiceIndex)}. ${card.choices[card.correctChoiceIndex]}`,
    };
  });

  const resourceResponse = await request('/v1/resources/resolve?path=%2Fquestion-bank-assets%2Faudio%2Flistening%2Fmain%2F001.mp3', token);
  const resourceBody = await resourceResponse.json();
  if (!resourceResponse.ok) throw new Error(`resource_resolve_failed:${resourceResponse.status}`);
  const download = await fetch(resourceBody.data.url, { headers: { range: 'bytes=0-31' } });
  if (![200, 206].includes(download.status)) throw new Error(`resource_download_failed:${download.status}`);
  const downloadedBytes = (await download.arrayBuffer()).byteLength;

  console.log(JSON.stringify({
    activeBanks: listBody.data.map((item) => ({ bankId: item.bankId, version: item.version, cards: item.declaredCardCount })),
    listeningSummary,
    release: { bankId: release.bankId, version: release.version, checksum: release.checksum, etag },
    etag304: cachedResponse.status,
    samples,
    resource: { publicPath: resourceBody.data.publicPath, checksum: resourceBody.data.checksum, status: download.status, downloadedBytes },
  }));
} finally {
  if (userId) {
    const deletion = await admin.auth.admin.deleteUser(userId);
    if (deletion.error) throw deletion.error;
  }
}
