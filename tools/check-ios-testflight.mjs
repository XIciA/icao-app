import { access, readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const app = JSON.parse(await readFile(path.join(root, 'app.json'), 'utf8'));
const releaseScriptPath = path.join(root, 'scripts/release-ios-testflight.sh');
await access(releaseScriptPath);
const releaseScript = await readFile(releaseScriptPath, 'utf8');
const failures = [];

if (app.expo.version !== '1.0.0') failures.push('Marketing Version must remain 1.0.0.');
if (app.expo.ios?.bundleIdentifier !== 'com.readyoufife.ios') failures.push('Unexpected iOS Bundle ID.');
if (!/^\d+$/u.test(String(app.expo.ios?.buildNumber ?? ''))) failures.push('iOS build number must be an integer string.');
const audioPlugin = app.expo.plugins?.find((plugin) => Array.isArray(plugin) && plugin[0] === 'expo-audio');
if (!audioPlugin?.[1]?.microphonePermission) failures.push('Expo Audio microphone permission text is missing.');

for (const required of [
  'ICAO_APP_VARIANT=production',
  "-destination 'generic/platform=iOS'",
  '-exportArchive',
  '--validate-app',
  '--upload-app',
  '--wait',
  '-authenticationKeyPath',
  'pnpm check:audio',
  'pnpm test:recording',
  'pnpm typecheck',
  'git diff --check',
  'create-testflight-candidate.mjs',
  'assign-groups',
]) {
  if (!releaseScript.includes(required)) failures.push(`TestFlight release script is missing: ${required}`);
}
for (const forbidden of ['devicectl', 'run:ios', 'simulator', 'EXPO_PUBLIC_ICAO_AUDIO_E2E=1']) {
  if (releaseScript.includes(forbidden)) failures.push(`TestFlight release script contains a forbidden delivery step: ${forbidden}`);
}

if (failures.length) {
  console.error('iOS TestFlight check failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log('iOS TestFlight release contract verified');
}
