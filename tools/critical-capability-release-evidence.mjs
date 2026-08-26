import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const SCHEMA_VERSION = 1;
const ACK_CONFIRMATION = '我已阅读录音与AI两份关键能力文档';
const DEVICE_CHECK_CONFIRMATION = '我已在真实设备完成并观察此项结果';
const DEVICE_FINAL_CONFIRMATION = '我确认逐项真机结果真实有效';
const HOUR_MS = 60 * 60 * 1000;
const ROOT = process.cwd();
const EVIDENCE_ROOT = path.join(ROOT, '.generated', 'critical-capabilities');
const AUDIO_RUNBOOK = 'docs/records/incidents/audio-recording/README.md';
const AI_RUNBOOK = 'docs/records/incidents/ai-learning-runtime/README.md';
const AI_LIVE_VERIFIER_FILES = [
  'services/api/scripts/live-verifier-account-fixture.mjs',
  'services/api/scripts/verify-ai-live.mjs',
  'services/api/scripts/verify-asr-live.mjs',
  'services/api/scripts/verify-review-live.mjs',
  'services/api/test/fixtures/aviation-asr-live-sample.m4a',
];
const CRITICAL_PREFIXES = [
  'app.config.js',
  'app.json',
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'packages/contracts/',
  'plugins/',
  'scripts/archive-ios-testflight.sh',
  'scripts/build-standalone-android.sh',
  'scripts/build-standalone-ios.sh',
  'scripts/lib/ios-release-product.sh',
  'scripts/lib/release-common.sh',
  'scripts/release-android.sh',
  'scripts/release-dual.sh',
  'scripts/release-ios-app-store.sh',
  'scripts/release-ios-testflight.sh',
  'scripts/release-ios.sh',
  'services/api/package.json',
  'services/api/src/account/',
  'services/api/src/ai/',
  'services/api/src/auth/',
  'services/api/src/config.ts',
  'services/api/src/feedback/',
  'services/api/scripts/verify-asr-live.mjs',
  'services/api/scripts/verify-ai-live.mjs',
  'services/api/scripts/verify-review-live.mjs',
  'services/api/scripts/live-verifier-account-fixture.mjs',
  'src/features/ai/',
  'src/components/auth/',
  'src/features/account/',
  'src/features/auth/',
  'src/features/feedback/',
  'src/features/question-bank/components/',
  'src/features/question-bank/recording/',
  'src/platform/api-client',
  'src/platform/audio/',
  'tools/audio-sensitive-fingerprint.mjs',
  'tools/app-store-connect-testflight.mjs',
  'tools/check-audio-boundaries.mjs',
  'tools/check-ios-testflight.mjs',
  'tools/check-wechat-runtime-freeze.mjs',
  'tools/create-testflight-candidate.mjs',
  'tools/critical-capability-release-evidence.mjs',
  'tools/verify-release-config.mjs',
  AUDIO_RUNBOOK,
  AI_RUNBOOK,
];
const VERSION_ONLY_FILES = new Set([
  'src/config/app-version.ts',
  'src/config/app-version.ios.ts',
  'src/config/app-version.android.ts',
]);
const DEVICE_CHECKS = [
  'recording1Second',
  'recording3Seconds',
  'recording10Seconds',
  'recordingRepeated10Times',
  'recordingAfterReferencePlayback',
  'replacementPreservesPreviousAsset',
  'questionNavigationPreservesAsset',
  'reentryPreservesAsset',
  'backgroundRecovery',
  'systemInterruptionRecovery',
  'permissionRecovery',
  'speakerRoute',
  'wiredHeadsetRoute',
  'bluetoothRoute',
  'playback',
  'transcribe',
  'grammar',
  'polish',
];

function fail(message) {
  throw new Error(`critical_release_evidence:${message}`);
}

function assert(value, message) {
  if (!value) fail(message);
}

function git(args) {
  return execFileSync('git', args, { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 }).toString('utf8').trim();
}

function repoFiles() {
  return execFileSync('git', ['ls-files', '-co', '--exclude-standard', '-z'], {
    cwd: ROOT,
    maxBuffer: 64 * 1024 * 1024,
  }).toString('utf8').split('\0').filter(Boolean).sort();
}

function isCritical(file) {
  return CRITICAL_PREFIXES.some((prefix) => prefix.endsWith('/') ? file.startsWith(prefix) : file === prefix || file.startsWith(`${prefix}.`));
}

function stableJson(value) {
  if (Array.isArray(value)) return value.map(stableJson);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableJson(value[key])]));
}

async function bytesForCriticalHash(file) {
  const bytes = await readFile(path.join(ROOT, file));
  if (file !== 'app.json') return bytes;
  const app = JSON.parse(bytes.toString('utf8'));
  if (app.expo?.ios) delete app.expo.ios.buildNumber;
  if (app.expo?.android) delete app.expo.android.versionCode;
  return Buffer.from(JSON.stringify(stableJson(app)));
}

async function hashFiles(files, reader = (file) => readFile(path.join(ROOT, file))) {
  const hash = createHash('sha256');
  for (const file of files.sort()) {
    let bytes;
    try {
      bytes = await reader(file);
    } catch (error) {
      if (error?.code === 'ENOENT') continue;
      throw error;
    }
    hash.update(file);
    hash.update('\0');
    hash.update(bytes);
    hash.update('\0');
  }
  return hash.digest('hex');
}

async function currentIdentity() {
  const files = repoFiles();
  const releaseSourceFiles = files.filter((file) => !VERSION_ONLY_FILES.has(file));
  const criticalFiles = files.filter((file) => isCritical(file) && !VERSION_ONLY_FILES.has(file));
  return {
    gitHead: git(['rev-parse', 'HEAD']),
    gitBranch: git(['branch', '--show-current']),
    dirty: Boolean(git(['status', '--porcelain'])),
    releaseSourceFingerprint: await hashFiles(releaseSourceFiles, bytesForCriticalHash),
    criticalFingerprint: await hashFiles(criticalFiles, bytesForCriticalHash),
    workspaceFingerprint: await hashFiles(files),
  };
}

async function sha256File(relativePath) {
  return createHash('sha256').update(await readFile(path.join(ROOT, relativePath))).digest('hex');
}

async function runbookHashes() {
  return {
    audio: await sha256File(AUDIO_RUNBOOK),
    ai: await sha256File(AI_RUNBOOK),
  };
}

function readDisplayVersion(source) {
  const match = source.match(/APP_DISPLAY_VERSION\s*=\s*['"]([^'"]+)['"]/u);
  return match?.[1];
}

async function appRelease(platform) {
  const app = JSON.parse(await readFile(path.join(ROOT, 'app.json'), 'utf8'));
  const platformVersionPath = `src/config/app-version.${platform}.ts`;
  const platformVersion = await readFile(path.join(ROOT, platformVersionPath), 'utf8').catch(() => '');
  const sharedVersion = await readFile(path.join(ROOT, 'src/config/app-version.ts'), 'utf8').catch(() => '');
  if (platform === 'ios') {
    return {
      platform,
      displayVersion: readDisplayVersion(platformVersion) ?? readDisplayVersion(sharedVersion) ?? 'unknown',
      marketingVersion: String(app.expo.version),
      build: String(app.expo.ios.buildNumber),
      applicationId: app.expo.ios.bundleIdentifier,
    };
  }
  return {
    platform,
    displayVersion: readDisplayVersion(platformVersion) ?? readDisplayVersion(sharedVersion) ?? 'unknown',
    marketingVersion: String(app.expo.version),
    build: String(app.expo.android.versionCode),
    applicationId: app.expo.android.package,
  };
}

function options(values) {
  const result = { _: [] };
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!value.startsWith('--')) {
      result._.push(value);
      continue;
    }
    const key = value.slice(2);
    const next = values[index + 1];
    assert(next && !next.startsWith('--'), `missing_option_value:${key}`);
    result[key] = next;
    index += 1;
  }
  return result;
}

function requirePlatform(platform) {
  assert(['ios', 'android'].includes(platform), `invalid_platform:${platform ?? 'missing'}`);
}

function requireOperator(value) {
  assert(typeof value === 'string' && value.trim().length >= 2 && value.trim().length <= 80, 'operator_required');
  return value.trim();
}

function requireOsMajor(value) {
  assert(/^\d{1,3}$/u.test(value ?? ''), 'os_major_required');
  return value;
}

function assertConfirmation(actual, expected) {
  assert(actual === expected, 'explicit_confirmation_required');
}

function isoTime(value, field) {
  const timestamp = Date.parse(value);
  assert(Number.isFinite(timestamp), `invalid_time:${field}`);
  assert(timestamp <= Date.now() + 5 * 60_000, `future_time:${field}`);
  return timestamp;
}

function assertFresh(value, hours, field) {
  const timestamp = isoTime(value, field);
  assert(Date.now() - timestamp <= hours * HOUR_MS, `stale:${field}`);
}

function platformTime() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    dateStyle: 'short',
    timeStyle: 'medium',
    hourCycle: 'h23',
  }).format(new Date());
  return `${parts} Asia/Shanghai`;
}

async function writeEvidence(relativePath, value) {
  const destination = path.join(EVIDENCE_ROOT, relativePath);
  await mkdir(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  await rename(temporary, destination);
  return destination;
}

async function readEvidence(relativePath) {
  const source = path.join(EVIDENCE_ROOT, relativePath);
  return JSON.parse(await readFile(source, 'utf8').catch((error) => {
    if (error?.code === 'ENOENT') fail(`missing_evidence:${relativePath}`);
    throw error;
  }));
}

function hashEvidence(value) {
  return createHash('sha256').update(JSON.stringify(stableJson(value))).digest('hex');
}

function validateDeviceEvidence(input, {
  kind,
  platform,
  identity,
  release,
  freshHours,
} = {}) {
  assert(input?.schemaVersion === SCHEMA_VERSION, `${kind}_device_schema`);
  assert(input.kind === `${kind}-real-device` && input.status === 'passed', `${kind}_device_status`);
  assert(input.platform === platform, `${kind}_device_platform`);
  requireOperator(input.operator);
  requireOsMajor(input.osMajor);
  assert(typeof input.platformTime === 'string' && input.platformTime.endsWith(' Asia/Shanghai'), `${kind}_device_platform_time`);
  if (identity) assertSource(input, identity, `${kind}_device`);
  if (release) assertReleaseMatch(input.release, release, `${kind}_device`);
  if (freshHours) assertFresh(input.verifiedAt, freshHours, `${kind}_device`);
  else isoTime(input.verifiedAt, `${kind}_device`);
  assert(input.observations && typeof input.observations === 'object', `${kind}_device_observations`);
  for (const check of DEVICE_CHECKS) {
    const observation = input.observations[check];
    assert(input.checks?.[check] === true, `${kind}_device_check:${check}`);
    assert(observation?.status === 'passed', `${kind}_device_observation:${check}`);
    requireOperator(observation.operator);
    isoTime(observation.observedAt, `${kind}_device_observation:${check}`);
    assert(
      typeof observation.platformTime === 'string' && observation.platformTime.endsWith(' Asia/Shanghai'),
      `${kind}_device_observation_platform_time:${check}`,
    );
  }
  assert(input.observationDigest === hashEvidence(input.observations), `${kind}_device_observation_digest_mismatch`);
  return input;
}

function validateAiLive(input, { fresh = true, verifierFingerprint } = {}) {
  assert(input?.schemaVersion === SCHEMA_VERSION, 'ai_live_schema');
  assert(input.kind === 'ai-live' && input.status === 'passed', 'ai_live_status');
  assert(typeof input.apiVersion === 'string' && input.apiVersion.trim(), 'ai_live_api_version');
  const apiVersion = input.apiVersion.trim();
  assert(!['development', 'test', 'unversioned'].includes(apiVersion.toLowerCase()), 'ai_live_api_unversioned');
  let apiOrigin;
  try {
    apiOrigin = new URL(input.apiOrigin).origin;
  } catch {
    fail('ai_live_api_origin');
  }
  assert(apiOrigin === 'https://api.readyoufife.com', 'ai_live_requires_production_api');
  if (verifierFingerprint) {
    assert(input.verifierFingerprint === verifierFingerprint, 'ai_live_verifier_changed');
  }
  if (fresh) assertFresh(input.verifiedAt, 24, 'ai_live');
  else isoTime(input.verifiedAt, 'ai_live');
  for (const check of ['transcribe', 'grammar', 'polish', 'aviationTerms', 'temporaryAudioRemoved']) {
    assert(input.checks?.[check] === true, `ai_live_check:${check}`);
  }
  return {
    schemaVersion: SCHEMA_VERSION,
    kind: 'ai-live',
    status: 'passed',
    apiVersion,
    apiOrigin,
    ...(input.verifierFingerprint ? { verifierFingerprint: input.verifierFingerprint } : {}),
    verifiedAt: input.verifiedAt,
    checks: {
      transcribe: true,
      grammar: true,
      polish: true,
      aviationTerms: true,
      temporaryAudioRemoved: true,
    },
  };
}

async function productionApiVersion() {
  const response = await fetch('https://api.readyoufife.com/health/ready', {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(15_000),
  }).catch(() => fail('production_api_readiness_unreachable'));
  assert(response.ok, `production_api_readiness_http:${response.status}`);
  const version = response.headers.get('x-icao-api-version')?.trim();
  assert(version, 'production_api_version_missing');
  assert(!['development', 'test', 'unversioned'].includes(version.toLowerCase()), 'production_api_version_invalid');
  return version;
}

async function acknowledge(platform, flags) {
  requirePlatform(platform);
  assertConfirmation(flags.confirm, ACK_CONFIRMATION);
  const now = new Date().toISOString();
  const evidence = {
    schemaVersion: SCHEMA_VERSION,
    kind: 'runbook-acknowledgement',
    status: 'passed',
    platform,
    operator: requireOperator(flags.operator),
    source: await currentIdentity(),
    runbooks: await runbookHashes(),
    acknowledgedAt: now,
    platformTime: platformTime(),
  };
  const output = await writeEvidence(`acknowledgement-${platform}.json`, evidence);
  console.log(`Critical runbooks acknowledged: ${output}`);
}

function completedDeviceChecks() {
  return Object.fromEntries(DEVICE_CHECKS.map((check) => [check, true]));
}

function deviceDraftPath(kind, platform) {
  return `drafts/${kind}-device-${platform}.json`;
}

async function readOptionalEvidence(relativePath) {
  return readEvidence(relativePath).catch((error) => {
    if (error instanceof Error && error.message.includes(`missing_evidence:${relativePath}`)) return undefined;
    throw error;
  });
}

async function recordDeviceCheck(kind, platform, check, flags) {
  assert(['dev', 'testflight'].includes(kind), `invalid_device_kind:${kind}`);
  requirePlatform(platform);
  if (kind === 'testflight') assert(platform === 'ios', 'testflight_requires_ios');
  assert(DEVICE_CHECKS.includes(check), `invalid_device_check:${check ?? 'missing'}`);
  assert(['passed', 'failed'].includes(flags.result), 'device_check_result_required');
  assertConfirmation(flags.confirm, DEVICE_CHECK_CONFIRMATION);
  const release = await appRelease(platform);
  if (kind === 'testflight') assert(flags.build === release.build, 'testflight_build_mismatch');
  const source = await currentIdentity();
  const osMajor = requireOsMajor(flags['os-major']);
  const operator = requireOperator(flags.operator);
  const relativePath = deviceDraftPath(kind, platform);
  const existing = await readOptionalEvidence(relativePath);
  if (existing) {
    assert(existing.kind === `${kind}-real-device-draft` && existing.platform === platform, 'device_draft_identity');
    assertSource(existing, source, 'device_draft');
    assertReleaseMatch(existing.release, release, 'device_draft');
    assert(existing.osMajor === osMajor, 'device_draft_os_major_changed');
  }
  const evidence = existing ?? {
    schemaVersion: SCHEMA_VERSION,
    kind: `${kind}-real-device-draft`,
    status: 'in-progress',
    platform,
    osMajor,
    source,
    release,
    observations: {},
    startedAt: new Date().toISOString(),
  };
  evidence.observations[check] = {
    status: flags.result,
    operator,
    observedAt: new Date().toISOString(),
    platformTime: platformTime(),
  };
  const output = await writeEvidence(relativePath, evidence);
  console.log(`${kind} real-device check recorded (${check}=${flags.result}): ${output}`);
}

async function finalizeDevice(kind, platform, flags) {
  assert(['dev', 'testflight'].includes(kind), `invalid_device_kind:${kind}`);
  requirePlatform(platform);
  if (kind === 'testflight') assert(platform === 'ios', 'testflight_requires_ios');
  assertConfirmation(flags.confirm, DEVICE_FINAL_CONFIRMATION);
  const identity = await currentIdentity();
  const release = await appRelease(platform);
  if (kind === 'testflight') assert(flags.build === release.build, 'testflight_build_mismatch');
  const draft = await readEvidence(deviceDraftPath(kind, platform));
  assertSource(draft, identity, 'device_draft');
  assertReleaseMatch(draft.release, release, 'device_draft');
  for (const check of DEVICE_CHECKS) {
    const observation = draft.observations?.[check];
    assert(observation?.status === 'passed', `device_check_not_passed:${check}`);
    requireOperator(observation.operator);
    isoTime(observation.observedAt, `device_observation:${check}`);
    assert(
      typeof observation.platformTime === 'string' && observation.platformTime.endsWith(' Asia/Shanghai'),
      `device_observation_platform_time:${check}`,
    );
  }
  const evidence = {
    schemaVersion: SCHEMA_VERSION,
    kind: `${kind}-real-device`,
    status: 'passed',
    platform,
    operator: requireOperator(flags.operator),
    osMajor: draft.osMajor,
    source: identity,
    release,
    checks: completedDeviceChecks(),
    observations: draft.observations,
    observationDigest: hashEvidence(draft.observations),
    verifiedAt: new Date().toISOString(),
    platformTime: platformTime(),
  };
  const output = await writeEvidence(`${kind}-device-${platform}.json`, evidence);
  console.log(`${kind} real-device evidence finalized: ${output}`);
}

async function runAiLive() {
  const verifierOutput = execFileSync(process.execPath, [path.join(ROOT, 'services/api/scripts/verify-ai-live.mjs')], {
    cwd: ROOT,
    env: process.env,
    maxBuffer: 16 * 1024 * 1024,
  }).toString('utf8').trim().split(/\r?\n/u).filter(Boolean).at(-1);
  assert(verifierOutput, 'ai_live_output_missing');
  const verifierFingerprint = await hashFiles(AI_LIVE_VERIFIER_FILES);
  const sanitized = validateAiLive({
    ...JSON.parse(verifierOutput),
    verifierFingerprint,
  }, { verifierFingerprint });
  const destination = await writeEvidence('ai-live.json', sanitized);
  console.log(`AI live evidence generated by the real verifier: ${destination}`);
}

function assertSource(evidence, identity, name) {
  assert(evidence?.status === 'passed', `${name}_status`);
  assert(evidence.source?.gitHead === identity.gitHead, `${name}_commit_changed`);
  assert(evidence.source?.releaseSourceFingerprint === identity.releaseSourceFingerprint, `${name}_release_source_changed`);
  assert(evidence.source?.criticalFingerprint === identity.criticalFingerprint, `${name}_source_changed`);
}

function assertReleaseMatch(actual, expected, name) {
  for (const field of ['platform', 'displayVersion', 'marketingVersion', 'build', 'applicationId']) {
    assert(actual?.[field] === expected[field], `${name}_release_mismatch:${field}`);
  }
}

async function verify(channel, platform) {
  requirePlatform(platform);
  const allowed = channel === 'testflight' && platform === 'ios'
    || channel === 'app-store' && platform === 'ios'
    || channel === 'android' && platform === 'android';
  assert(allowed, `invalid_channel_platform:${channel}:${platform}`);

  const identity = await currentIdentity();
  const hashes = await runbookHashes();
  const release = await appRelease(platform);
  const acknowledgement = await readEvidence(`acknowledgement-${platform}.json`);
  assertSource(acknowledgement, identity, 'acknowledgement');
  assert(acknowledgement.platform === platform, 'acknowledgement_platform');
  assertFresh(acknowledgement.acknowledgedAt, 24, 'acknowledgement');
  assert(acknowledgement.runbooks?.audio === hashes.audio && acknowledgement.runbooks?.ai === hashes.ai, 'runbooks_changed_after_acknowledgement');

  const devEvidenceRequired = channel === 'android';
  let dev;
  if (devEvidenceRequired) {
    dev = await readEvidence(`dev-device-${platform}.json`);
    validateDeviceEvidence(dev, {
      kind: 'dev',
      platform,
      identity,
      freshHours: 7 * 24,
    });
  }

  const verifierFingerprint = await hashFiles(AI_LIVE_VERIFIER_FILES);
  const aiLive = validateAiLive(await readEvidence('ai-live.json'), { verifierFingerprint });
  const activeApiVersion = await productionApiVersion();
  assert(activeApiVersion === aiLive.apiVersion, 'production_api_version_changed_after_ai_live');
  let testflight;
  if (channel === 'app-store') {
    testflight = await readEvidence('testflight-device-ios.json');
    validateDeviceEvidence(testflight, {
      kind: 'testflight',
      platform: 'ios',
      identity,
      release,
      freshHours: 7 * 24,
    });
  }

  const verifiedAt = new Date().toISOString();
  const finalEvidence = {
    schemaVersion: SCHEMA_VERSION,
    kind: 'critical-capability-release',
    status: 'passed',
    channel,
    platform,
    release,
    apiVersion: aiLive.apiVersion,
    source: identity,
    runbooks: hashes,
    inputs: {
      acknowledgement: hashEvidence(acknowledgement),
      ...(dev ? { devRealDevice: hashEvidence(dev) } : {}),
      aiLive: hashEvidence(aiLive),
      ...(testflight ? { testflightRealDevice: hashEvidence(testflight) } : {}),
    },
    rules: {
      devEvidenceRequired,
      aiLiveRequired: true,
      testflightEvidenceRequired: channel === 'app-store',
      releaseBypassSupported: false,
    },
    verifiedAt,
    platformTime: platformTime(),
  };
  const safeBuild = release.build.replace(/[^a-zA-Z0-9._-]/gu, '_');
  const output = await writeEvidence(`releases/${channel}-${platform}-${safeBuild}.json`, finalEvidence);
  console.log(`Critical capability release gate passed: ${output}`);
}

function selfTest() {
  const now = new Date().toISOString();
  const valid = validateAiLive({
    schemaVersion: 1,
    kind: 'ai-live',
    status: 'passed',
    apiVersion: 'test-api',
    apiOrigin: 'https://api.readyoufife.com',
    verifierFingerprint: 'self-test-verifier',
    verifiedAt: now,
    checks: { transcribe: true, grammar: true, polish: true, aviationTerms: true, temporaryAudioRemoved: true },
    transcript: 'must not be copied',
  }, { fresh: false, verifierFingerprint: 'self-test-verifier' });
  assert(!('transcript' in valid), 'ai_live_sanitization');
  let rejected = false;
  try {
    validateAiLive({ ...valid, checks: { ...valid.checks, polish: false } }, { fresh: false });
  } catch {
    rejected = true;
  }
  assert(rejected, 'ai_live_failure_must_be_rejected');
  const observations = Object.fromEntries(DEVICE_CHECKS.map((check) => [check, {
    status: 'passed',
    operator: 'self-test',
    observedAt: now,
    platformTime: '2026-08-13, 12:00:00 Asia/Shanghai',
  }]));
  const device = {
    schemaVersion: 1,
    kind: 'dev-real-device',
    status: 'passed',
    platform: 'ios',
    operator: 'self-test',
    osMajor: '18',
    source: {},
    release: {},
    checks: completedDeviceChecks(),
    observations,
    observationDigest: hashEvidence(observations),
    verifiedAt: now,
    platformTime: '2026-08-13, 12:00:00 Asia/Shanghai',
  };
  validateDeviceEvidence(device, { kind: 'dev', platform: 'ios' });
  rejected = false;
  try {
    validateDeviceEvidence({ ...device, observationDigest: 'edited' }, { kind: 'dev', platform: 'ios' });
  } catch {
    rejected = true;
  }
  assert(rejected, 'edited_device_evidence_must_be_rejected');
  assert(completedDeviceChecks().recordingRepeated10Times === true, 'device_check_contract');
  assert(DEVICE_CHECKS.includes('systemInterruptionRecovery'), 'device_interruption_contract');
  console.log('critical capability release evidence self-test passed');
}

function usage() {
  console.error(`Usage:
  node tools/critical-capability-release-evidence.mjs acknowledge <ios|android> --operator <name> --confirm "${ACK_CONFIRMATION}"
  node tools/critical-capability-release-evidence.mjs list-device-checks
  node tools/critical-capability-release-evidence.mjs record-device-check <dev|testflight> <ios|android> <check> --result <passed|failed> --operator <name> --os-major <number> --confirm "${DEVICE_CHECK_CONFIRMATION}" [--build <number>]
  node tools/critical-capability-release-evidence.mjs finalize-device <dev|testflight> <ios|android> --operator <name> --confirm "${DEVICE_FINAL_CONFIRMATION}" [--build <number>]
  node tools/critical-capability-release-evidence.mjs run-ai-live
  node tools/critical-capability-release-evidence.mjs verify <testflight|app-store|android> <ios|android>
  node tools/critical-capability-release-evidence.mjs self-test`);
}

const [command, ...values] = process.argv.slice(2);
try {
  if (command === 'acknowledge') {
    const parsed = options(values);
    await acknowledge(parsed._[0], parsed);
  } else if (command === 'list-device-checks') {
    console.log(DEVICE_CHECKS.join('\n'));
  } else if (command === 'record-device-check') {
    const parsed = options(values);
    await recordDeviceCheck(parsed._[0], parsed._[1], parsed._[2], parsed);
  } else if (command === 'finalize-device') {
    const parsed = options(values);
    await finalizeDevice(parsed._[0], parsed._[1], parsed);
  } else if (command === 'run-ai-live') {
    await runAiLive();
  } else if (command === 'verify') {
    await verify(values[0], values[1]);
  } else if (command === 'self-test') {
    selfTest();
  } else {
    usage();
    process.exitCode = 2;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
