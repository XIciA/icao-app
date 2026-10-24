import { emitAudioDiagnostic } from '@/platform/audio/audio-diagnostics';

import { recordingMediaProbe, type RecordingMediaProbe } from './recording-media-probe';
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
  private readonly loginSessions = new Set<string>();
  retainSessionForLogin(sessionId: string) { this.loginSessions.add(sessionId); }
  releaseSessionFromLogin(sessionId: string) { this.loginSessions.delete(sessionId); }
  private readonly assets = new Map<string, StoredAsset>();
  private readonly mediaProbe: RecordingMediaProbe;

  constructor(dependencies: { mediaProbe?: RecordingMediaProbe } = {}) {
    this.mediaProbe = dependencies.mediaProbe ?? recordingMediaProbe;
  }

  async commitRaw(input: RawRecording & { cardId: string; operationDurationMs: number; sessionId: string }): Promise<RecordingAsset> {
    let uri: string | undefined;
    try {
      if (input.kind !== 'web-blob') throw new RecordingRepositoryError('recording_commit_failed');
      if (input.operationDurationMs < MIN_RECORDING_DURATION_MS) throw new RecordingRepositoryError('recording_too_short');
      if (formatForWebBlob(input.blob) !== input.format || input.mimeType !== input.blob.type) {
        throw new RecordingRepositoryError('recording_file_incomplete');
      }
      if (input.blob.size < MIN_RECORDING_BYTES) throw new RecordingRepositoryError('recording_file_incomplete');
      uri = URL.createObjectURL(input.blob);
      const probe = await this.mediaProbe.probe(input, uri).catch(() => {
        throw new RecordingRepositoryError('recording_media_unreadable');
      });
      if (!probe.playable || !probe.hasAudioTrack) throw new RecordingRepositoryError('recording_media_unreadable');
      const mediaDurationMs = probe.durationMs ?? input.operationDurationMs;
      const tolerance = Math.max(500, Math.max(mediaDurationMs, input.operationDurationMs) * 0.2);
      if (mediaDurationMs < MIN_RECORDING_DURATION_MS
        || Math.abs(mediaDurationMs - input.operationDurationMs) > tolerance) {
        throw new RecordingRepositoryError('recording_media_duration_mismatch');
      }

      const id = createId();
      const createdAt = Date.now();
      const asset = {
        byteSize: input.blob.size,
        cardId: input.cardId,
        createdAt: new Date(createdAt).toISOString(),
        durationMillis: Math.round(mediaDurationMs),
        format: input.format,
        id,
        mimeType: input.mimeType,
        recorderMimeType: input.recorderMimeType,
        sessionId: input.sessionId,
        storageKind: 'web-blob',
        uri,
      } satisfies RecordingAsset;
      this.assets.set(id, { asset, createdAt });
      uri = undefined;
      emitAudioDiagnostic({
        code: 'recording_committed',
        level: 'info',
        mediaDurationMillis: probe.durationMs,
        operationDurationMillis: input.operationDurationMs,
        phase: 'ready',
        recorderDurationMillis: input.recorderDurationMs,
        scope: 'recording',
      });
      return asset;
    } catch (error) {
      if (uri) URL.revokeObjectURL(uri);
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
    if (this.loginSessions.has(sessionId)) return;
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
