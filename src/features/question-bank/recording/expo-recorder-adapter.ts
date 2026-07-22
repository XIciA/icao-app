import {
  AudioQuality,
  getRecordingPermissionsAsync,
  IOSOutputFormat,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { File, Paths } from 'expo-file-system';
import { useRef } from 'react';
import { Platform } from 'react-native';

import type { RawRecording, RecordingFormat } from './types';

const VOICE_RECORDING_OPTIONS = {
  ...RecordingPresets.HIGH_QUALITY,
  bitRate: 256_000,
  isMeteringEnabled: true,
  numberOfChannels: 1,
  ios: {
    ...RecordingPresets.HIGH_QUALITY.ios,
    audioQuality: AudioQuality.HIGH,
    extension: '.wav',
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
    outputFormat: IOSOutputFormat.LINEARPCM,
    sampleRate: 16_000,
  },
};

const MIN_BYTES_PER_MILLISECOND = 6.4;
const E2E_ENABLED = __DEV__ && process.env.EXPO_PUBLIC_ICAO_AUDIO_E2E === '1';

function createSilentWave(durationMillis: number) {
  const sampleRate = 16_000;
  const sampleCount = Math.ceil(sampleRate * durationMillis / 1_000);
  const bytes = new Uint8Array(44 + sampleCount * 2);
  const view = new DataView(bytes.buffer);
  const writeText = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) bytes[offset + index] = value.charCodeAt(index);
  };
  writeText(0, 'RIFF');
  view.setUint32(4, bytes.length - 8, true);
  writeText(8, 'WAVE');
  writeText(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeText(36, 'data');
  view.setUint32(40, sampleCount * 2, true);
  return bytes;
}

export type ExpoRecorderAdapter = {
  cancel: () => Promise<string | undefined>;
  durationMillis: number;
  isRecording: () => boolean;
  prepare: () => Promise<void>;
  requestPermission: () => Promise<boolean>;
  start: () => void;
  stop: () => Promise<RawRecording>;
};

export async function getMicrophonePermission() {
  return getRecordingPermissionsAsync();
}

export async function requestMicrophonePermission() {
  return requestRecordingPermissionsAsync();
}

export function useExpoRecorderAdapter(): ExpoRecorderAdapter {
  const recorder = useAudioRecorder(VOICE_RECORDING_OPTIONS);
  const recorderState = useAudioRecorderState(recorder, 200);
  const format: RecordingFormat = Platform.OS === 'ios' ? 'wav' : 'm4a';
  const e2e = useRef({ prepared: false, recording: false, startedAt: 0, uri: undefined as string | undefined });
  const nativeStartedAt = useRef<number | undefined>(undefined);

  if (E2E_ENABLED) {
    return {
      async cancel() {
        e2e.current.prepared = false;
        e2e.current.recording = false;
        return e2e.current.uri;
      },
      durationMillis: e2e.current.recording ? Math.max(0, Date.now() - e2e.current.startedAt) : 0,
      isRecording: () => e2e.current.recording,
      async prepare() {
        e2e.current.prepared = true;
        e2e.current.uri = undefined;
      },
      requestPermission: async () => true,
      start() {
        if (!e2e.current.prepared) throw new Error('record_prepare_failed');
        e2e.current.recording = true;
        e2e.current.startedAt = Date.now();
      },
      async stop() {
        if (!e2e.current.recording) throw new Error('record_stop_failed');
        const durationMillis = Math.max(1_200, Date.now() - e2e.current.startedAt);
        const file = new File(Paths.cache, `icao-audio-e2e-${Date.now()}.wav`);
        file.write(createSilentWave(durationMillis));
        e2e.current.prepared = false;
        e2e.current.recording = false;
        e2e.current.uri = file.uri;
        return { durationMillis, format: 'wav', minBytesPerMillisecond: MIN_BYTES_PER_MILLISECOND, uri: file.uri };
      },
    };
  }

  return {
    async cancel() {
      let uri: string | undefined;
      try {
        if (recorder.isRecording) await recorder.stop();
        uri = recorder.uri ?? undefined;
      } catch {
        uri = recorder.uri ?? undefined;
      } finally {
        nativeStartedAt.current = undefined;
      }
      return uri;
    },
    durationMillis: recorderState.durationMillis,
    isRecording: () => {
      try {
        return recorder.isRecording;
      } catch {
        return false;
      }
    },
    async prepare() {
      nativeStartedAt.current = undefined;
      await recorder.prepareToRecordAsync();
    },
    async requestPermission() {
      const permission = await requestMicrophonePermission();
      return permission.granted;
    },
    start() {
      recorder.record();
      if (!recorder.isRecording) throw new Error('record_start_failed');
      nativeStartedAt.current = Date.now();
    },
    async stop() {
      const statusBeforeStop = recorder.getStatus();
      const elapsedMillis = nativeStartedAt.current === undefined
        ? 0
        : Math.max(0, Date.now() - nativeStartedAt.current);
      const durationBeforeStop = Math.max(
        elapsedMillis,
        recorderState.durationMillis,
        statusBeforeStop.durationMillis,
      );
      try {
        await recorder.stop();
        const status = recorder.getStatus();
        const uri = status.url ?? recorder.uri ?? undefined;
        if (!uri) throw new Error('record_stop_failed');
        return {
          durationMillis: Math.max(durationBeforeStop, status.durationMillis),
          format,
          minBytesPerMillisecond: MIN_BYTES_PER_MILLISECOND,
          uri,
        };
      } finally {
        nativeStartedAt.current = undefined;
      }
    },
  };
}
