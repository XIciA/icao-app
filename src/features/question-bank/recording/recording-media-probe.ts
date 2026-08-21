import { createAudioPlayer, type AudioStatus } from 'expo-audio';

import type { RawRecording } from './types';

const PROBE_TIMEOUT_MS = 4_000;

export type RecordingMediaProbeResult = {
  durationMs?: number;
  hasAudioTrack: boolean;
  playable: boolean;
};

export interface RecordingMediaProbe {
  probe(raw: RawRecording, sourceUri?: string): Promise<RecordingMediaProbeResult>;
}

function validDuration(status: AudioStatus) {
  return Number.isFinite(status.duration) && status.duration > 0
    ? status.duration * 1_000
    : undefined;
}

export const recordingMediaProbe: RecordingMediaProbe = {
  async probe(raw) {
    if (raw.kind !== 'native-file') throw new Error('recording_media_unreadable');
    const player = createAudioPlayer(raw.uri, { updateInterval: 100 });
    let subscription: { remove(): void } | undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      return await new Promise<RecordingMediaProbeResult>((resolve, reject) => {
        let settled = false;
        const finish = (result?: RecordingMediaProbeResult, error?: Error) => {
          if (settled) return;
          settled = true;
          if (timeout) clearTimeout(timeout);
          subscription?.remove();
          if (error) reject(error);
          else if (result) resolve(result);
        };
        const inspect = (status: AudioStatus) => {
          if (status.playbackState === 'error') {
            finish(undefined, new Error('recording_media_unreadable'));
            return;
          }
          const durationMs = validDuration(status);
          if (status.isLoaded && durationMs) {
            finish({ durationMs, hasAudioTrack: true, playable: true });
          }
        };
        subscription = player.addListener('playbackStatusUpdate', inspect);
        timeout = setTimeout(
          () => finish(undefined, new Error('recording_media_unreadable')),
          PROBE_TIMEOUT_MS,
        );
        try {
          inspect(player.currentStatus);
        } catch {
          finish(undefined, new Error('recording_media_unreadable'));
        }
      });
    } finally {
      if (timeout) clearTimeout(timeout);
      subscription?.remove();
      try {
        player.remove();
      } catch {
        // The probe owns this short-lived player and always releases it.
      }
    }
  },
};
