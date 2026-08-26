import { Buffer } from 'node:buffer';
import { createPrivateKey, sign } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const defaultConfigPath = path.join(os.homedir(), '.config/icao-app/testflight.env');

function base64url(value) {
  return Buffer.from(value).toString('base64url');
}

function parseConfig(source) {
  const values = {};
  for (const rawLine of source.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator < 1) throw new Error('App Store Connect config contains an invalid line.');
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

export async function appStoreConnectCredentials() {
  const configPath = process.env.ICAO_TESTFLIGHT_CONFIG ?? defaultConfigPath;
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
  if (!keyId || !issuerId || !keyPath) {
    throw new Error('App Store Connect Key ID, Issuer ID, or private-key path is missing.');
  }
  const privateKeyDirectory = path.resolve(os.homedir(), '.appstoreconnect/private_keys');
  const resolvedKeyPath = path.resolve(keyPath);
  if (!resolvedKeyPath.startsWith(`${privateKeyDirectory}${path.sep}`) || path.extname(resolvedKeyPath) !== '.p8') {
    throw new Error('The App Store Connect private key must be a .p8 file under ~/.appstoreconnect/private_keys/.');
  }
  const keyStat = await stat(resolvedKeyPath).catch(() => undefined);
  if (!keyStat?.isFile()) throw new Error('The configured App Store Connect private key is not readable.');
  if ((keyStat.mode & 0o077) !== 0) throw new Error('App Store Connect private-key permissions must be 0600.');
  return { issuerId, keyId, privateKey: await readFile(resolvedKeyPath, 'utf8') };
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

export async function appStoreConnectApi(credentials, pathname, options = {}) {
  const { acceptedStatuses = [], ...requestOptions } = options;
  const response = await fetch(`https://api.appstoreconnect.apple.com${pathname}`, {
    ...requestOptions,
    headers: {
      Authorization: `Bearer ${token(credentials)}`,
      'Content-Type': 'application/json',
      ...requestOptions.headers,
    },
    signal: AbortSignal.timeout(30_000),
  });
  if (acceptedStatuses.includes(response.status)) return undefined;
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

export async function appStoreConnectAppContext(credentials, root) {
  const app = JSON.parse(await readFile(path.join(root, 'app.json'), 'utf8'));
  const bundleId = app.expo.ios?.bundleIdentifier;
  if (!bundleId) throw new Error('app.json is missing expo.ios.bundleIdentifier.');
  const result = await appStoreConnectApi(
    credentials,
    `/v1/apps?filter%5BbundleId%5D=${encodeURIComponent(bundleId)}&limit=1`,
  );
  if (result.data?.length !== 1) {
    throw new Error('App Store Connect app was not found for the configured Bundle ID.');
  }
  return { app, appId: result.data[0].id, bundleId };
}
