import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const apiBase = (process.env.API_BASE ?? 'http://127.0.0.1:3101').replace(/\/$/u, '');
const supabaseUrl = process.env.SUPABASE_URL;
const evidenceFile = process.env.AI_VERIFY_EVIDENCE_FILE;
const REQUIRED_API_ORIGIN = 'https://api.readyoufife.com';
const REQUIRED_SUPABASE_ORIGIN = 'https://cloud.readyoufife.com';

function requireExactProductionOrigin(value, expectedOrigin, errorCode) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(errorCode);
  }
  if (
    parsed.origin !== expectedOrigin
    || parsed.pathname !== '/'
    || parsed.search
    || parsed.hash
    || parsed.username
    || parsed.password
  ) throw new Error(errorCode);
}

// This guard must run before readiness checks, child processes, test-account creation, or paid AI calls.
requireExactProductionOrigin(`${apiBase}/`, REQUIRED_API_ORIGIN, 'ai_live_requires_production_api_origin');
requireExactProductionOrigin(supabaseUrl ?? '', REQUIRED_SUPABASE_ORIGIN, 'ai_live_requires_production_supabase_origin');

function run(script) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [new URL(script, import.meta.url).pathname], {
      env: process.env,
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    let stdout = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code !== 0) {
        reject(new Error(`${script}:exit_${code}`));
        return;
      }
      const line = stdout.trim().split(/\r?\n/u).filter(Boolean).at(-1);
      try { resolve(JSON.parse(line)); } catch { reject(new Error(`${script}:invalid_json_output`)); }
    });
  });
}

async function apiVersion() {
  const response = await fetch(`${apiBase}/health/ready`, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(15_000),
  });
  const body = await response.json().catch(() => undefined);
  if (!response.ok || body?.data?.status !== 'ok') throw new Error('ai_live_readiness_failed');
  const version = response.headers.get('x-icao-api-version') ?? body?.data?.version;
  if (!version || ['development', 'test', 'unversioned'].includes(String(version))) {
    throw new Error('ai_live_production_api_version_missing');
  }
  return version;
}

const version = await apiVersion();
const [asr, review] = await Promise.all([
  run('./verify-asr-live.mjs'),
  run('./verify-review-live.mjs'),
]);

const evidence = {
  schemaVersion: 1,
  kind: 'ai-live',
  status: 'passed',
  apiOrigin: new URL(apiBase).origin,
  apiVersion: String(version),
  verifiedAt: new Date().toISOString(),
  checks: {
    transcribe: asr.status === 'ok',
    grammar: review.grammar === true,
    polish: review.polish === true,
    aviationTerms: review.aviationTerms === true,
    temporaryAudioRemoved: asr.temporaryAudioRemoved === true
      && asr.cleanupComplete === true
      && review.cleanupComplete === true,
  },
};
if (!Object.values(evidence.checks).every(Boolean)) throw new Error('ai_live_check_incomplete');
if (evidenceFile) {
  await mkdir(dirname(evidenceFile), { recursive: true });
  await writeFile(evidenceFile, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
}
console.log(JSON.stringify(evidence));
