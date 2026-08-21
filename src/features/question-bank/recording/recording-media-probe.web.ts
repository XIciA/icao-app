import type { RecordingMediaProbe } from './recording-media-probe';

const PROBE_TIMEOUT_MS = 4_000;

export const recordingMediaProbe: RecordingMediaProbe = {
  async probe(raw, sourceUri) {
    if (raw.kind !== 'web-blob' || !sourceUri) throw new Error('recording_media_unreadable');
    const media = new Audio();
    media.preload = 'metadata';
    try {
      return await new Promise((resolve, reject) => {
        let settled = false;
        const timeout = setTimeout(() => finish(undefined, new Error('recording_media_unreadable')), PROBE_TIMEOUT_MS);
        const cleanup = () => {
          clearTimeout(timeout);
          media.removeEventListener('canplay', onCanPlay);
          media.removeEventListener('error', onError);
        };
        const finish = (
          result?: { durationMs?: number; hasAudioTrack: boolean; playable: boolean },
          error?: Error,
        ) => {
          if (settled) return;
          settled = true;
          cleanup();
          if (error) reject(error);
          else if (result) resolve(result);
        };
        const onCanPlay = () => finish({
          durationMs: Number.isFinite(media.duration) && media.duration > 0 ? media.duration * 1_000 : undefined,
          hasAudioTrack: true,
          playable: true,
        });
        const onError = () => finish(undefined, new Error('recording_media_unreadable'));
        media.addEventListener('canplay', onCanPlay);
        media.addEventListener('error', onError);
        media.src = sourceUri;
        media.load();
      });
    } finally {
      media.removeAttribute('src');
      media.load();
    }
  },
};

export type { RecordingMediaProbe, RecordingMediaProbeResult } from './recording-media-probe';
