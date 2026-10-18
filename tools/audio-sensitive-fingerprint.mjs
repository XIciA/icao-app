import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const [action = 'print', platform] = process.argv.slice(2);
if (!['print', 'write', 'verify'].includes(action) || (action !== 'print' && !['ios', 'android'].includes(platform))) {
  console.error('Usage: node tools/audio-sensitive-fingerprint.mjs <print|write|verify> [ios|android]');
  process.exit(2);
}

const root = process.cwd();
const inputs = [
  'app.json',
  'app.config.js',
  'eslint.config.js',
  'package.json',
  'src/app/_layout.tsx',
  'src/app/index.tsx',
  'src/features/ai/ai-client.ts',
  'src/features/question-bank/components/QuestionBankStudyScreen.tsx',
  'src/features/question-bank/components/SpeakingPracticePanel.tsx',
  'src/features/question-bank/components/SpeakingPracticePanel.native.tsx',
  'src/features/question-bank/components/ExamSpeakingPractice.native.tsx',
  'src/features/question-bank/components/StudyAudioPlayer.tsx',
  'src/features/question-bank/components/StudyTaskRenderer.tsx',
  'src/features/question-bank/components/StudyWorkbench.tsx',
  'src/features/question-bank/hooks/useStudySession.ts',
  'src/features/question-bank/recording',
  'src/features/radio-player/RadioPlayerProvider.tsx',
  'src/platform/audio',
  'tools/check-audio-boundaries.mjs',
  'tools/audio-sensitive-fingerprint.mjs',
  '.maestro/audio-recording-flow.yaml',
  'scripts/run-audio-e2e.sh',
  'scripts/build-standalone-android.sh',
  'scripts/build-standalone-ios.sh',
  'scripts/archive-ios-testflight.sh',
  'scripts/release-ios-testflight.sh',
  'scripts/release-android.sh',
  'scripts/release-ios.sh',
  'tools/verify-release-config.mjs',
];

async function expand(relativePath) {
  const absolute = path.join(root, relativePath);
  const entries = await readdir(absolute, { withFileTypes: true }).catch(() => undefined);
  if (!entries) return [relativePath];
  const children = await Promise.all(entries.map((entry) => expand(path.join(relativePath, entry.name))));
  return children.flat();
}

const files = (await Promise.all(inputs.map(expand))).flat().sort();
const hash = createHash('sha256');
for (const file of files) {
  const bytes = await readFile(path.join(root, file));
  hash.update(file.split(path.sep).join('/'));
  hash.update('\0');
  hash.update(bytes);
  hash.update('\0');
}
const fingerprint = hash.digest('hex');

if (action === 'print') {
  console.log(fingerprint);
  process.exit(0);
}

const evidenceDirectory = path.join(root, '.generated', 'audio-e2e');
const evidencePath = path.join(evidenceDirectory, `${platform}.json`);
if (action === 'write') {
  await mkdir(evidenceDirectory, { recursive: true });
  const evidence = {
    schemaVersion: 1,
    platform,
    fingerprint,
    verifiedAt: new Date().toISOString(),
    flow: '.maestro/audio-recording-flow.yaml',
  };
  await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  console.log(`${platform} audio E2E evidence recorded for ${fingerprint}`);
  process.exit(0);
}

const evidence = JSON.parse(await readFile(evidencePath, 'utf8').catch(() => {
  throw new Error(`Missing ${platform} audio E2E evidence. Run pnpm audio:e2e:${platform}.`);
}));
if (evidence.platform !== platform || evidence.fingerprint !== fingerprint) {
  throw new Error(`Audio-sensitive files changed after the ${platform} E2E run. Run pnpm audio:e2e:${platform} again.`);
}
console.log(`${platform} audio E2E fingerprint verified`);
