import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const sourceRoot = path.join(root, 'src');
const orchestrator = 'src/platform/audio/audio-session-orchestrator.ts';
const recorderAdapter = 'src/features/question-bank/recording/expo-recorder-adapter.ts';
const recorderAdapterWeb = 'src/features/question-bank/recording/expo-recorder-adapter.web.ts';
const repository = 'src/features/question-bank/recording/recording-repository.ts';
const repositoryWeb = 'src/features/question-bank/recording/recording-repository.web.ts';
const productionExtensions = new Set(['.ts', '.tsx']);

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(absolute);
    return productionExtensions.has(path.extname(entry.name)) ? [absolute] : [];
  }));
  return nested.flat();
}

const failures = [];
const files = await sourceFiles(sourceRoot);

function relative(file) {
  return path.relative(root, file).split(path.sep).join('/');
}

function reject(file, content, pattern, allowed, message) {
  const name = relative(file);
  if (name.includes('/__tests__/') || name.endsWith('-test.ts') || name.endsWith('-test.tsx')) return;
  if (allowed.includes(name) || !pattern.test(content)) return;
  failures.push(`${name}: ${message}`);
}

for (const file of files) {
  const name = relative(file);
  const content = await readFile(file, 'utf8');
  reject(file, content, /\bsetAudioModeAsync\b/, [orchestrator], 'setAudioModeAsync is owned by AudioSessionOrchestrator');
  reject(
    file,
    content,
    /\b(?:getRecordingPermissionsAsync|RecordingPresets|requestRecordingPermissionsAsync|useAudioRecorder|useAudioRecorderState)\b/,
    [recorderAdapter, recorderAdapterWeb],
    'native recording hooks, presets, and permissions are owned by the Expo recorder adapter',
  );
  reject(file, content, /audio-session-coordinator/, [], 'the retired audio session coordinator must not be referenced');
  reject(file, content, /\b(?:type|interface)\s+AudioOwner\b/, [orchestrator], 'AudioOwner must have one definition');
  reject(file, content, /\b(?:type|interface)\s+RecordingAsset\b/, ['src/features/question-bank/recording/types.ts'], 'RecordingAsset must have one definition');
  reject(file, content, /\bclass\s+AudioSessionOrchestrator\b/, [orchestrator], 'the audio session orchestrator must have one implementation');
  reject(file, content, /\bclass\s+RecordingRepository\b/, [repository, repositoryWeb], 'the recording repository must have one platform implementation');
  reject(file, content, /\ballowsRecording\s*:/, [orchestrator], 'audio profiles must be defined only by the orchestrator');

  if (name.startsWith('src/features/question-bank/recording/') && ![repository, repositoryWeb, recorderAdapter, recorderAdapterWeb].includes(name) && !name.includes('/__tests__/')) {
    if (/from\s+['"]expo-file-system['"]/.test(content) || /\.delete\s*\(/.test(content)) {
      failures.push(`${name}: recording file creation and deletion belong to RecordingRepository`);
    }
  }
  if (name.includes('/components/') && /from\s+['"]expo-file-system['"]/.test(content)) {
    failures.push(`${name}: UI components may not delete recording files directly`);
  }
}

if (failures.length) {
  console.error('Audio architecture boundary check failed:\n');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log('audio architecture boundaries verified');
}
