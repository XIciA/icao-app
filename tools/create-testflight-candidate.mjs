import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const root = process.cwd();
const archivePath = process.argv[2];
const ipaPath = process.argv[3];
if (!archivePath || !ipaPath) throw new Error('Archive and IPA paths are required.');

async function checksum(file) {
  return createHash('sha256').update(await readFile(file)).digest('hex');
}

const app = JSON.parse(await readFile(path.join(root, 'app.json'), 'utf8'));
const criticalFiles = [
  'src/features/question-bank/recording/recording-engine.ts',
  'src/features/question-bank/recording/expo-recorder-adapter.ts',
  'src/features/question-bank/recording/expo-recorder-adapter.web.ts',
  'src/features/question-bank/recording/recording-repository.ts',
  'src/features/question-bank/recording/recording-repository.web.ts',
  'src/features/question-bank/recording/recording-container-validator.ts',
  'src/features/question-bank/recording/use-speaking-recording-controller.ts',
  'src/features/question-bank/recording/types.ts',
  'src/platform/audio/audio-session-orchestrator.ts',
];
const codeFingerprints = Object.fromEntries(await Promise.all(
  criticalFiles.map(async (file) => [file, await checksum(path.join(root, file))]),
));
const archiveInfo = path.join(archivePath, 'Info.plist');
const candidate = {
  schemaVersion: 1,
  commitSha: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  createdAt: new Date().toISOString(),
  bundleIdentifier: app.expo.ios.bundleIdentifier,
  marketingVersion: app.expo.version,
  buildNumber: app.expo.ios.buildNumber,
  codeFingerprints,
  archiveInfoSha256: await checksum(archiveInfo),
  ipaSha256: await checksum(ipaPath),
};
const output = path.join(root, '.generated/testflight/candidate.json');
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(candidate, null, 2)}\n`);
console.log(`TestFlight candidate evidence written for commit ${candidate.commitSha}.`);
