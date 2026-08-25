import { loadOpsConfig } from './config';

const config = loadOpsConfig();

if (config.nodeEnv !== 'production') {
  throw new Error('ops_config_preflight_requires_production');
}
if (config.opsHost !== '0.0.0.0' || config.opsPort !== 3102) {
  throw new Error('ops_config_preflight_invalid_listener');
}

console.log(`Ops API production configuration verified for release ${config.apiReleaseId}.`);
