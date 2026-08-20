import { Buffer } from 'node:buffer';
import { createPrivateKey, sign } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const root = process.cwd();
const command = process.argv[2];
const configPath = process.env.ICAO_TESTFLIGHT_CONFIG
  ?? path.join(os.homedir(), '.config/icao-app/testflight.env');

function base64url(value) {
  return Buffer.from(value).toString('base64url');
}

function parseConfig(source) {
  const values = {};
  for (const rawLine of source.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator < 1) throw new Error('TestFlight config contains an invalid line.');
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

async function credentials() {
  let configStat;
  try {
    configStat = await stat(configPath);
  } catch {
    throw new Error(`Missing App Store Connect config: ${configPath}`);
  }
  if ((configStat.mode & 0o077) !== 0) throw new Error('App Store Connect config permissions must be 0600.');
  const config = parseConfig(await readFile(configPath, 'utf8'));
  const keyId = process.env.APP_STORE_CONNECT_KEY_ID ?? config.APP_STORE_CONNECT_KEY_ID;
  const issuerId = process.env.APP_STORE_CONNECT_ISSUER_ID ?? config.APP_STORE_CONNECT_ISSUER_ID;
  const configuredKeyPath = process.env.APP_STORE_CONNECT_KEY_PATH ?? config.APP_STORE_CONNECT_KEY_PATH;
  const keyPath = configuredKeyPath
    ? configuredKeyPath.replace(/^~(?=\/)/u, os.homedir())
    : keyId ? path.join(os.homedir(), `.appstoreconnect/private_keys/AuthKey_${keyId}.p8`) : undefined;
  if (!keyId || !issuerId || !keyPath) throw new Error('App Store Connect Key ID, Issuer ID, or private-key path is missing.');
  const privateKeyDirectory = path.resolve(os.homedir(), '.appstoreconnect/private_keys');
  const resolvedKeyPath = path.resolve(keyPath);
  if (!resolvedKeyPath.startsWith(`${privateKeyDirectory}${path.sep}`) || path.extname(resolvedKeyPath) !== '.p8') {
    throw new Error('The App Store Connect private key must be a .p8 file under ~/.appstoreconnect/private_keys/.');
  }
  const keyStat = await stat(resolvedKeyPath).catch(() => undefined);
  if (!keyStat?.isFile()) throw new Error('The configured App Store Connect private key is not readable.');
  if ((keyStat.mode & 0o077) !== 0) throw new Error('App Store Connect private-key permissions must be 0600.');
  return { issuerId, keyId, keyPath: resolvedKeyPath, privateKey: await readFile(resolvedKeyPath, 'utf8') };
}

function token({ issuerId, keyId, privateKey }) {
  const issuedAt = Math.floor(Date.now() / 1_000);
  const header = base64url(JSON.stringify({ alg: 'ES256', kid: keyId, typ: 'JWT' }));
  const payload = base64url(JSON.stringify({ aud: 'appstoreconnect-v1', exp: issuedAt + 1_000, iat: issuedAt, iss: issuerId }));
  const message = `${header}.${payload}`;
  const signature = sign('sha256', Buffer.from(message), {
    dsaEncoding: 'ieee-p1363',
    key: createPrivateKey(privateKey),
  });
  return `${message}.${base64url(signature)}`;
}

async function api(credentialsValue, pathname, options = {}) {
  const response = await fetch(`https://api.appstoreconnect.apple.com${pathname}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token(credentialsValue)}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => undefined);
    const issue = body?.errors?.[0];
    const code = issue?.code ? `, ${issue.code}` : '';
    const detail = issue?.detail ?? 'No response detail';
    throw new Error(`App Store Connect request failed (HTTP ${response.status}${code}): ${detail}`);
  }
  if (response.status === 204) return undefined;
  return response.json();
}

async function appContext(credentialsValue) {
  const app = JSON.parse(await readFile(path.join(root, 'app.json'), 'utf8'));
  const bundleId = app.expo.ios?.bundleIdentifier;
  if (!bundleId) throw new Error('app.json is missing expo.ios.bundleIdentifier.');
  const result = await api(credentialsValue, `/v1/apps?filter%5BbundleId%5D=${encodeURIComponent(bundleId)}&limit=1`);
  if (result.data?.length !== 1) throw new Error('App Store Connect app was not found for the configured Bundle ID.');
  return { app, appId: result.data[0].id, bundleId };
}

async function recentBuilds(credentialsValue, appId, limit = 20) {
  const result = await api(credentialsValue, `/v1/builds?filter%5Bapp%5D=${encodeURIComponent(appId)}&sort=-uploadedDate&limit=${limit}`);
  return result.data ?? [];
}

async function prepareBuild() {
  const credentialsValue = await credentials();
  const { app, appId, bundleId } = await appContext(credentialsValue);
  const builds = await recentBuilds(credentialsValue, appId, 1);
  const remote = Number(builds[0]?.attributes?.version ?? 0);
  const local = Number(app.expo.ios?.buildNumber ?? 0);
  if (!Number.isSafeInteger(remote) || !Number.isSafeInteger(local)) throw new Error('iOS build numbers must be integers.');
  const buildNumber = String(Math.max(remote, local) + 1);
  app.expo.ios = { ...app.expo.ios, buildNumber };
  await writeFile(path.join(root, 'app.json'), `${JSON.stringify(app, null, 2)}\n`);
  const outputPath = path.join(root, '.generated/testflight/version.json');
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify({ appId, buildNumber, bundleId, marketingVersion: app.expo.version }, null, 2)}\n`);
  console.log(`Prepared iOS TestFlight build ${buildNumber}.`);
}

async function verifyBuild() {
  const credentialsValue = await credentials();
  const { app, appId } = await appContext(credentialsValue);
  const local = Number(app.expo.ios?.buildNumber ?? 0);
  const builds = await recentBuilds(credentialsValue, appId, 1);
  const remote = Number(builds[0]?.attributes?.version ?? 0);
  if (!Number.isSafeInteger(local) || local <= remote) {
    throw new Error('Local iOS build number is not newer than App Store Connect. Run release:ios:testflight:prepare, review, and commit it first.');
  }
  console.log(`iOS build ${local} is newer than the current App Store Connect build.`);
}

async function assignInternalGroups() {
  const credentialsValue = await credentials();
  const { app, appId } = await appContext(credentialsValue);
  const buildNumber = String(app.expo.ios?.buildNumber ?? '');
  let builds = [];
  let target;
  for (let attempt = 0; attempt < 30 && !target; attempt += 1) {
    builds = await recentBuilds(credentialsValue, appId, 50);
    target = builds.find((build) => String(build.attributes?.version) === buildNumber);
    if (!target) await new Promise((resolve) => setTimeout(resolve, 10_000));
  }
  if (!target) throw new Error('The uploaded TestFlight build is not visible in App Store Connect yet.');
  let groups = [];
  for (const previous of builds.filter((build) => build.id !== target.id)) {
    const related = await api(
      credentialsValue,
      `/v1/betaGroups?filter%5Bbuilds%5D=${encodeURIComponent(previous.id)}&filter%5BisInternalGroup%5D=true&limit=200`,
    );
    groups = (related.data ?? []).filter((group) => group.attributes?.isInternalGroup === true);
    if (groups.length > 0) break;
  }
  const targetGroups = await api(
    credentialsValue,
    `/v1/betaGroups?filter%5Bbuilds%5D=${encodeURIComponent(target.id)}&filter%5BisInternalGroup%5D=true&limit=200`,
  );
  const targetGroupIds = new Set((targetGroups.data ?? []).map((group) => group.id));
  const missingGroups = groups.filter(
    (group) => group.attributes?.hasAccessToAllBuilds !== true && !targetGroupIds.has(group.id),
  );
  if (missingGroups.length > 0) {
    await api(credentialsValue, `/v1/builds/${target.id}/relationships/betaGroups`, {
      body: JSON.stringify({ data: missingGroups.map((group) => ({ id: group.id, type: 'betaGroups' })) }),
      method: 'POST',
    });
  }
  console.log(
    `Uploaded build is available to ${groups.length} existing internal TestFlight group(s); added ${missingGroups.length}.`,
  );
}

if (command === 'prepare') await prepareBuild();
else if (command === 'verify-build') await verifyBuild();
else if (command === 'assign-groups') await assignInternalGroups();
else throw new Error('Usage: node tools/app-store-connect-testflight.mjs <prepare|verify-build|assign-groups>');
