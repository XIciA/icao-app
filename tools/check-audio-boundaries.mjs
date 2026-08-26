import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const sourceRoot = path.join(root, 'src');
const orchestrator = 'src/platform/audio/audio-session-orchestrator.ts';
const sessionManagedPlayer = 'src/platform/audio/session-managed-player.ts';
const webRadioPlayer = 'src/features/radio-player/RadioPlayerProvider.web.tsx';
const recorderAdapter = 'src/features/question-bank/recording/expo-recorder-adapter.ts';
const recorderAdapterWeb = 'src/features/question-bank/recording/expo-recorder-adapter.web.ts';
const repository = 'src/features/question-bank/recording/recording-repository.ts';
const repositoryWeb = 'src/features/question-bank/recording/recording-repository.web.ts';
const recordingEngine = 'src/features/question-bank/recording/recording-engine.ts';
const containerValidator = 'src/features/question-bank/recording/recording-container-validator.ts';
const mediaProbe = 'src/features/question-bank/recording/recording-media-probe.ts';
const retiredRecordingStateMachine = 'src/features/question-bank/recording/recording-state-machine.ts';
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
  if (name === retiredRecordingStateMachine) {
    failures.push(`${name}: RecordingEngine is the only recording lifecycle owner; do not restore the retired reducer`);
  }
  reject(file, content, /\bsetAudioModeAsync\b/, [orchestrator], 'setAudioModeAsync is owned by AudioSessionOrchestrator');
  reject(file, content, /\bsetIsAudioActiveAsync\b/, [orchestrator], 'setIsAudioActiveAsync is owned by AudioSessionOrchestrator');
  reject(
    file,
    content,
    /import\s*\{[^}]*\b(?:createAudioPlayer|useAudioPlayer)\b[^}]*\}\s*from\s*['"]expo-audio['"]/s,
    [sessionManagedPlayer, webRadioPlayer],
    'Expo Audio players must use the session-managed factory or hook so pause cannot deactivate a recording session',
  );
  reject(
    file,
    content,
    /\b(?:createAudioPlayer|useAudioPlayer)\s*\(/,
    [sessionManagedPlayer, webRadioPlayer],
    'Expo Audio player construction must stay behind the session-managed boundary',
  );
  reject(
    file,
    content,
    /(?:import\s*\*\s*as\s+\w+\s*from|require\s*\(|import\s*\()\s*['"]expo-audio['"]\s*\)?/,
    [orchestrator, sessionManagedPlayer, recorderAdapter, recorderAdapterWeb, webRadioPlayer],
    'namespace, require, or dynamic Expo Audio access may not bypass the audio ownership boundaries',
  );
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
  reject(file, content, /\bclass\s+RecordingEngine\b/, [recordingEngine], 'RecordingEngine must have one implementation');
  reject(file, content, /\ballowsRecording\s*:/, [orchestrator], 'audio profiles must be defined only by the orchestrator');

  if (name === recorderAdapter && /\brecorder\.currentTime\b/.test(content)) {
    failures.push(`${name}: recorder.currentTime has platform-divergent units; use RecorderState.durationMillis and keep operation time in RecordingEngine`);
  }
  if (name === recorderAdapter
    && !/export\s+const\s+IOS_VOICE_RECORDING_OPTIONS\s*=\s*RecordingPresets\.HIGH_QUALITY\s*;/.test(content)) {
    failures.push(`${name}: iOS production recording must bind directly to the Expo HIGH_QUALITY preset without encoding overrides`);
  }
  if (name === recorderAdapter && !/recorderRef\.current\?\.isRecording\s*===\s*true/.test(content)) {
    failures.push(`${name}: native start acknowledgement must read the underlying recorder.isRecording fact`);
  }
  if (name === recorderAdapter && /IOSOutputFormat\.LINEARPCM/.test(content)) {
    failures.push(`${name}: WAV/LINEARPCM is diagnostic-only and must not become the production default`);
  }
  if ((name === repository || name === containerValidator) && /minBytesPerMillisecond|MIN_BYTES_PER_MILLISECOND/.test(content)) {
    failures.push(`${name}: recording validity must not be inferred from bitrate or bytes per millisecond`);
  }
  if (name === repository && !/inspectRecordingContainer/.test(content)) {
    failures.push(`${name}: native commits must preserve deterministic container validation`);
  }
  if (name === repository && !/recordingMediaProbe/.test(content)) {
    failures.push(`${name}: native commits must verify decoder-readable media before publication`);
  }
  if (name === containerValidator && !/mediaDurationMs/.test(content)) {
    failures.push(`${name}: container validation must expose real audio-track duration`);
  }
  if (name === sessionManagedPlayer && (
    !/keepAudioSessionActive\s*:\s*true/.test(content)
    || !/useAudioPlayer\(source,\s*withManagedAudioSession\(options\)\)/.test(content)
    || !/createAudioPlayer\(source,\s*withManagedAudioSession\(options\)\)/.test(content)
  )) {
    failures.push(`${name}: every managed player must keep the native session active; AudioSessionOrchestrator owns activation and profile changes`);
  }
  if (name === mediaProbe && !/createSessionManagedAudioPlayer/.test(content)) {
    failures.push(`${name}: native media probing must use the platform decoder without playing`);
  }
  if (name.startsWith('src/features/question-bank/recording/')
    && name !== repositoryWeb
    && !name.includes('/__tests__/')
    && /URL\.createObjectURL\s*\(/.test(content)) {
    failures.push(`${name}: Web RecordingRepository is the only Blob URL owner`);
  }
  if (name === 'src/features/question-bank/recording/use-recording-playback.ts' && /\bplayer\.remove\s*\(/.test(content)) {
    failures.push(`${name}: useAudioPlayer owns native player disposal; do not deregister a mounted playback consumer`);
  }

  if (name.startsWith('src/features/question-bank/recording/') && ![repository, repositoryWeb, recorderAdapter, recorderAdapterWeb].includes(name) && !name.includes('/__tests__/')) {
    if (/from\s+['"]expo-file-system(?:\/[^'"]*)?['"]/.test(content)
      || /require\s*\(\s*['"]expo-file-system(?:\/[^'"]*)?['"]\s*\)/.test(content)) {
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
