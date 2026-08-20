import { Directory, File, Paths } from 'expo-file-system';

import { emitAudioDiagnostic } from '@/platform/audio/audio-diagnostics';

import { inspectRecordingContainer } from './recording-container-validator';
import { RecordingRepositoryError } from './recording-repository-error';
import type { RawRecording, RecordingAsset } from './types';

const MIN_RECORDING_DURATION_MS = 400;
const FILE_SETTLE_INTERVAL_MS = 100;
const MAX_SETTLE_ATTEMPTS = 20;
const ORPHAN_MAX_AGE_MS = 24 * 60 * 60 * 1_000;

export { RecordingRepositoryError } from './recording-repository-error';

type RecordingRepositoryDependencies = {
  createId?: () => string;
  now?: () => number;
  wait?: (milliseconds: number) => Promise<void>;
};

let idSequence = 0;

function defaultId() {
  idSequence += 1;
  return `rec-${Date.now().toString(36)}-${idSequence.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function safeSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]+/g, '-').slice(0, 100) || 'unknown';
}

function bestEffortDelete(file?: File) {
  if (!file?.exists) return;
  try {
    file.delete();
  } catch {
    // The repository is the only deletion owner; native readers may release asynchronously.
  }
}

export class RecordingRepository {
  private readonly root = new Directory(Paths.cache, 'icao-recordings');
  private readonly createId: () => string;
  private readonly now: () => number;
  private readonly wait: (milliseconds: number) => Promise<void>;

  constructor(dependencies: RecordingRepositoryDependencies = {}) {
    this.createId = dependencies.createId ?? defaultId;
    this.now = dependencies.now ?? Date.now;
    this.wait = dependencies.wait ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  }

  async commitRaw(input: RawRecording & { cardId: string; diagnosticId?: string; sessionId: string }): Promise<RecordingAsset> {
    const source = new File(input.uri);
    let pending: File | undefined;
    let destination: File | undefined;
    try {
      if (input.durationMillis < MIN_RECORDING_DURATION_MS) {
        throw new RecordingRepositoryError('recording_too_short');
      }
      const sourceSize = await this.validatedSettledSize(source, input.format, input.diagnosticId);

      this.root.create({ idempotent: true, intermediates: true });
      const sessionDirectory = new Directory(this.root, safeSegment(input.sessionId));
      sessionDirectory.create({ idempotent: true, intermediates: true });
      const id = this.createId();
      pending = new File(sessionDirectory, `${safeSegment(id)}.${input.format}.pending`);
      destination = new File(sessionDirectory, `${safeSegment(id)}.${input.format}`);
      source.copy(pending);
      if (!pending.exists || pending.size !== sourceSize) {
        throw new RecordingRepositoryError('recording_commit_failed');
      }
      pending.move(destination);
      if (!destination.exists || destination.size !== sourceSize) {
        throw new RecordingRepositoryError('recording_commit_failed');
      }
      bestEffortDelete(source);
      const asset = {
        byteSize: sourceSize,
        cardId: input.cardId,
        createdAt: new Date(this.now()).toISOString(),
        durationMillis: input.durationMillis,
        format: input.format,
        id,
        sessionId: input.sessionId,
        uri: destination.uri,
      } satisfies RecordingAsset;
      emitAudioDiagnostic({
        byteSize: sourceSize,
        code: 'recording_committed',
        diagnosticId: input.diagnosticId,
        durationMillis: input.durationMillis,
        format: input.format,
        level: 'info',
        meteringDetected: input.meteringDetected,
        phase: 'ready',
        scope: 'recording',
      });
      return asset;
    } catch (error) {
      bestEffortDelete(pending);
      bestEffortDelete(destination);
      const code = error instanceof RecordingRepositoryError ? error.code : 'recording_commit_failed';
      emitAudioDiagnostic({
        code,
        diagnosticId: input.diagnosticId,
        durationMillis: input.durationMillis,
        format: input.format,
        level: 'error',
        meteringDetected: input.meteringDetected,
        phase: 'finalizing',
        scope: 'recording',
      });
      throw error instanceof RecordingRepositoryError ? error : new RecordingRepositoryError(code);
    }
  }

  discard(asset: RecordingAsset) {
    const rootPrefix = this.root.uri.endsWith('/') ? this.root.uri : `${this.root.uri}/`;
    if (!asset.uri.startsWith(rootPrefix)) return;
    bestEffortDelete(new File(asset.uri));
    emitAudioDiagnostic({ code: 'recording_discarded', level: 'info', scope: 'recording' });
  }

  discardRaw(uri?: string) {
    if (!uri) return;
    bestEffortDelete(new File(uri));
  }

  assetExists(asset: RecordingAsset) {
    try {
      return new File(asset.uri).exists;
    } catch {
      return false;
    }
  }

  cleanupSession(sessionId: string) {
    const directory = new Directory(this.root, safeSegment(sessionId));
    if (!directory.exists) return;
    try {
      directory.delete();
    } catch {
      // A player or upload may still have a handle; the orphan sweep will retry later.
    }
  }

  cleanupExpired(now = this.now()) {
    if (!this.root.exists) return;
    const cutoff = now - ORPHAN_MAX_AGE_MS;
    for (const entry of this.root.list()) {
      if (!(entry instanceof Directory)) continue;
      const modifiedAt = entry.info().modificationTime ?? 0;
      if (modifiedAt > cutoff) continue;
      try {
        entry.delete();
      } catch {
        // Best-effort maintenance; active native readers must not be interrupted.
      }
    }
  }

  private async validatedSettledSize(file: File, format: RawRecording['format'], diagnosticId?: string) {
    let previous = -1;
    let current = 0;
    let existed = false;
    for (let attempt = 0; attempt < MAX_SETTLE_ATTEMPTS; attempt += 1) {
      await this.wait(FILE_SETTLE_INTERVAL_MS);
      if (!file.exists) continue;
      existed = true;
      current = file.size;
      if (current > 0 && current === previous) {
        const inspection = inspectRecordingContainer(file.bytesSync(), format);
        if (inspection.status === 'valid') {
          emitAudioDiagnostic({
            byteSize: current,
            code: 'recording_container_validated',
            diagnosticId,
            format,
            level: 'info',
            phase: 'finalizing',
            scope: 'recording',
          });
          return current;
        }
      }
      previous = current;
    }
    if (!existed) throw new RecordingRepositoryError('recording_source_missing');
    if (current <= 0) throw new RecordingRepositoryError('recording_file_incomplete');
    const inspection = inspectRecordingContainer(file.bytesSync(), format);
    if (inspection.status === 'invalid') throw new RecordingRepositoryError('recording_container_invalid');
    throw new RecordingRepositoryError('recording_file_incomplete');
  }
}

export const recordingRepository = new RecordingRepository();
