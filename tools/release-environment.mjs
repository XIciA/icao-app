import { readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const configPath = fileURLToPath(new URL('../config/release/environments.json', import.meta.url));
export function resolveReleaseEnvironment(environment, config = JSON.parse(readFileSync(configPath, 'utf8'))) {
  if (!['production', 'testing'].includes(environment)) throw new Error('release_environment_invalid');
  if (config.schemaVersion !== 1) throw new Error('release_environment_schema_invalid');
  const target = config[environment];
  const branch = environment === 'production' ? 'main' : 'develop';
  if (target?.branch !== branch) throw new Error('release_environment_branch_invalid');
  if (environment === 'testing' && (target.ready !== true || target.pending?.length)) {
    throw new Error('testing_runtime_not_ready:independent_server_and_client_isolation_must_be_verified');
  }
  for (const key of ['apiUrl', 'supabaseUrl']) {
    let url;
    try { url = new URL(target[key]); } catch { throw new Error(`release_environment_url_invalid:${key}`); }
    if (url.protocol !== 'https:' || url.origin !== target[key] || url.username || url.password) {
      throw new Error(`release_environment_url_invalid:${key}`);
    }
    if (environment === 'testing' && Object.values(config.production).includes(target[key])) {
      throw new Error(`testing_runtime_points_to_production:${key}`);
    }
  }
  return { environment, branch, apiUrl: target.apiUrl, supabaseUrl: target.supabaseUrl };
}

export function validateRuntimeValues(target, values) {
  if (values.EXPO_PUBLIC_ICAO_DATA_ENVIRONMENT !== target.environment) {
    throw new Error('release_data_namespace_does_not_match_environment');
  }
  if (values.EXPO_PUBLIC_ICAO_API_URL !== target.apiUrl
    || values.EXPO_PUBLIC_SUPABASE_URL !== target.supabaseUrl) {
    throw new Error('release_runtime_does_not_match_selected_environment');
  }
  if (target.environment === 'testing' && !/^[A-Za-z0-9+/]{43}=$/u.test(values.EXPO_PUBLIC_ICAO_CONTENT_PUBLIC_KEY || '')) {
    throw new Error('testing_content_public_key_required');
  }
  if (!values.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim()) throw new Error('release_publishable_key_missing');
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  const target = resolveReleaseEnvironment(process.argv[2]);
  if (process.argv.includes('--validate-values')) validateRuntimeValues(target, process.env);
  console.log(JSON.stringify(target));
}
