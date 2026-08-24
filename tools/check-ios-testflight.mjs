import { access, readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const app = JSON.parse(await readFile(path.join(root, 'app.json'), 'utf8'));
const releaseScriptPath = path.join(root, 'scripts/release-ios-testflight.sh');
await access(releaseScriptPath);
const releaseScript = await readFile(releaseScriptPath, 'utf8');
const apiClient = await readFile(path.join(root, 'src/platform/api-client.ts'), 'utf8');
const aiClient = await readFile(path.join(root, 'src/features/ai/ai-client.ts'), 'utf8');
const audioE2eScript = await readFile(path.join(root, 'scripts/run-audio-e2e.sh'), 'utf8');
const failures = [];

if (app.expo.version !== '1.0.0') failures.push('Marketing Version must remain 1.0.0.');
if (app.expo.ios?.bundleIdentifier !== 'com.readyoufife.ios') failures.push('Unexpected iOS Bundle ID.');
if (!/^\d+$/u.test(String(app.expo.ios?.buildNumber ?? ''))) failures.push('iOS build number must be an integer string.');
const audioPlugin = app.expo.plugins?.find((plugin) => Array.isArray(plugin) && plugin[0] === 'expo-audio');
if (!audioPlugin?.[1]?.microphonePermission) failures.push('Expo Audio microphone permission text is missing.');

for (const required of [
  'ICAO_APP_VARIANT=production',
  'configure_ios_cng_product "$PROJECT_ROOT/ios"',
  '-workspace "$IOS_WORKSPACE"',
  '-scheme "$IOS_SCHEME"',
  'find_ios_release_app "$ARCHIVE_PATH/Products/Applications" "$IOS_PRODUCT_NAME"',
  "-destination 'generic/platform=iOS'",
  '-exportArchive',
  '--validate-app',
  '--upload-app',
  '--wait',
  '-authenticationKeyPath',
  'pnpm check:audio',
  'pnpm test:recording',
  'pnpm typecheck',
  'pnpm check:ios:testflight',
  'verify_ios_storekit_dependencies',
  'git diff --check',
  'create-testflight-candidate.mjs',
  'assign-groups',
]) {
  if (!releaseScript.includes(required)) failures.push(`TestFlight release script is missing: ${required}`);
}
for (const forbidden of [
  'devicectl',
  'run:ios',
  'simulator',
  'EXPO_PUBLIC_ICAO_AUDIO_E2E=1',
  'ios/ICAO.xcworkspace',
  'ICAO_IOS_SCHEME:-ICAO',
]) {
  if (releaseScript.includes(forbidden)) failures.push(`TestFlight release script contains a forbidden delivery step: ${forbidden}`);
}
for (const forbidden of ['AbortSignal.any', 'AbortSignal.timeout']) {
  if (apiClient.includes(forbidden)) failures.push(`Native API client uses an unsupported React Native abort API: ${forbidden}`);
}
if (!audioE2eScript.includes('EXPO_NO_DOTENV=1')) {
  failures.push('Native audio E2E can be overridden by local dotenv configuration.');
}
if (!aiClient.includes('packager-status:running')) {
  failures.push('Native AI E2E does not require a real React Native fetch with an external abort signal.');
}
if (!aiClient.includes('Constants.expoConfig?.hostUri')) {
  failures.push('Native AI E2E does not probe the same Metro origin used by the running development build.');
}

if (failures.length) {
  console.error('iOS TestFlight check failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log('iOS TestFlight release contract verified');
}
