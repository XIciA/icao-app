import { emitAudioDiagnostic } from '@/platform/audio/audio-diagnostics';

import { RecordingRepositoryError } from './recording-repository-error';
import type { RawRecording, RecordingAsset } from './types';

const MIN_RECORDING_DURATION_MS = 400;
// WebM/Opus is compressed and Chromium may produce a valid short recording
// below 1 KB. Keep only a small container floor; duration and the encoder's
// bytes-per-millisecond hint provide the remaining integrity check.
const MIN_RECORDING_BYTES = 256;
const ORPHAN_MAX_AGE_MS = 24 * 60 * 60 * 1_000;

let idSequence = 0;

function createId() {
  idSequence += 1;
  return `rec-web-${Date.now().toString(36)}-${idSequence.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

type StoredAsset = { asset: RecordingAsset; createdAt: number };

export class RecordingRepository {
  private readonly assets = new Map<string, StoredAsset>();

  async commitRaw(input: RawRecording & { cardId: string; sessionId: string }): Promise<RecordingAsset> {
    try {
      if (input.durationMillis < MIN_RECORDING_DURATION_MS) {
        throw new RecordingRepositoryError('recording_too_short');
      }
      const response = await fetch(input.uri);
      if (!response.ok) throw new RecordingRepositoryError('recording_commit_failed');
      const blob = await response.blob();
      const minimumSize = Math.max(MIN_RECORDING_BYTES, Math.round(input.durationMillis * input.minBytesPerMillisecond));
      if (blob.size < minimumSize) throw new RecordingRepositoryError('recording_file_incomplete');

      const id = createId();
      const uri = URL.createObjectURL(blob);
      const createdAt = Date.now();
      const asset = {
        byteSize: blob.size,
        cardId: input.cardId,
        createdAt: new Date(createdAt).toISOString(),
        durationMillis: input.durationMillis,
        format: input.format,
        id,
        sessionId: input.sessionId,
        uri,
      } satisfies RecordingAsset;
      this.assets.set(id, { asset, createdAt });
      if (input.uri.startsWith('blob:')) URL.revokeObjectURL(input.uri);
      emitAudioDiagnostic({ code: 'recording_committed', level: 'info', phase: 'ready', scope: 'recording' });
      return asset;
    } catch (error) {
      const code = error instanceof RecordingRepositoryError ? error.code : 'recording_commit_failed';
      emitAudioDiagnostic({ code, level: 'error', phase: 'finalizing', scope: 'recording' });
      throw error instanceof RecordingRepositoryError ? error : new RecordingRepositoryError(code);
    }
  }

  discard(asset: RecordingAsset) {
    const stored = this.assets.get(asset.id);
    if (!stored || stored.asset.uri !== asset.uri) return;
    URL.revokeObjectURL(stored.asset.uri);
    this.assets.delete(asset.id);
    emitAudioDiagnostic({ code: 'recording_discarded', level: 'info', scope: 'recording' });
  }

  discardRaw(uri?: string) {
    if (uri?.startsWith('blob:')) URL.revokeObjectURL(uri);
  }

  assetExists(asset: RecordingAsset) {
    return this.assets.get(asset.id)?.asset.uri === asset.uri;
  }

  cleanupSession(sessionId: string) {
    for (const { asset } of this.assets.values()) {
      if (asset.sessionId === sessionId) this.discard(asset);
    }
  }

  cleanupExpired(now = Date.now()) {
    for (const { asset, createdAt } of this.assets.values()) {
      if (createdAt <= now - ORPHAN_MAX_AGE_MS) this.discard(asset);
    }
  }
}

export { RecordingRepositoryError } from './recording-repository-error';
export const recordingRepository = new RecordingRepository();
