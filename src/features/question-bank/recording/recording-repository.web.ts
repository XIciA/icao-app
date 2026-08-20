import { emitAudioDiagnostic } from '@/platform/audio/audio-diagnostics';

import { RecordingRepositoryError } from './recording-repository-error';
import type { RawRecording, RecordingAsset } from './types';

const MIN_RECORDING_DURATION_MS = 400;
const MIN_RECORDING_BYTES = 256;
const ORPHAN_MAX_AGE_MS = 24 * 60 * 60 * 1_000;

let idSequence = 0;

function createId() {
  idSequence += 1;
  return `rec-web-${Date.now().toString(36)}-${idSequence.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function formatForWebBlob(blob: Blob): 'm4a' | 'ogg' | 'webm' | undefined {
  const mimeType = blob.type.toLowerCase().split(';', 1)[0]?.trim();
  if (mimeType === 'audio/webm') return 'webm';
  if (mimeType === 'audio/ogg') return 'ogg';
  if (mimeType === 'audio/mp4' || mimeType === 'audio/m4a' || mimeType === 'audio/x-m4a') return 'm4a';
  return undefined;
}

type StoredAsset = { asset: RecordingAsset; createdAt: number };

export class RecordingRepository {
  private readonly assets = new Map<string, StoredAsset>();

  async commitRaw(input: RawRecording & { cardId: string; sessionId: string }): Promise<RecordingAsset> {
    try {
      if (input.kind !== 'web-blob') throw new RecordingRepositoryError('recording_commit_failed');
      if (input.durationMs < MIN_RECORDING_DURATION_MS) throw new RecordingRepositoryError('recording_too_short');
      if (formatForWebBlob(input.blob) !== input.format || input.mimeType !== input.blob.type) {
        throw new RecordingRepositoryError('recording_file_incomplete');
      }
      if (input.blob.size < MIN_RECORDING_BYTES) throw new RecordingRepositoryError('recording_file_incomplete');

      const id = createId();
      const createdAt = Date.now();
      const uri = URL.createObjectURL(input.blob);
      const asset = {
        byteSize: input.blob.size,
        cardId: input.cardId,
        createdAt: new Date(createdAt).toISOString(),
        durationMillis: input.durationMs,
        format: input.format,
        id,
        mimeType: input.mimeType,
        recorderMimeType: input.recorderMimeType,
        sessionId: input.sessionId,
        storageKind: 'web-blob',
        uri,
      } satisfies RecordingAsset;
      this.assets.set(id, { asset, createdAt });
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
    if (!stored || stored.asset.uri !== asset.uri || asset.storageKind !== 'web-blob') return;
    URL.revokeObjectURL(stored.asset.uri);
    this.assets.delete(asset.id);
    emitAudioDiagnostic({ code: 'recording_discarded', level: 'info', scope: 'recording' });
  }

  discardRaw(_raw?: RawRecording) {
    // A raw Web recording is a Blob without an object URL, so it needs no explicit cleanup.
  }

  assetExists(asset: RecordingAsset) {
    return asset.storageKind === 'web-blob' && this.assets.get(asset.id)?.asset.uri === asset.uri;
  }

  cleanupSession(sessionId: string) {
    for (const { asset } of this.assets.values()) if (asset.sessionId === sessionId) this.discard(asset);
  }

  cleanupExpired(now = Date.now()) {
    for (const { asset, createdAt } of this.assets.values()) {
      if (createdAt <= now - ORPHAN_MAX_AGE_MS) this.discard(asset);
    }
  }
}

export { RecordingRepositoryError } from './recording-repository-error';
export const recordingRepository = new RecordingRepository();
