import {
  getRecordingPermissionsAsync,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  useAudioRecorder,
  useAudioRecorderState,
  type RecordingStatus,
} from 'expo-audio';
import { File, Paths } from 'expo-file-system';
import { useCallback, useEffect, useRef } from 'react';
import { Platform } from 'react-native';

import type {
  RawRecording,
  RecorderPort,
  RecorderRuntimeEvent,
  RecorderSnapshot,
  RecordingOperationContext,
} from './types';

export type NativeRecorderFailureCode =
  | 'recording_media_services_reset'
  | 'recording_native_prepare_failed'
  | 'recording_native_start_failed';

export type NativePrepareFailureReason =
  | 'audio-session-configuration'
  | 'native-recorder-prepare'
  | 'unknown-native-prepare';

export class NativeRecorderError extends Error {
  constructor(
    readonly code: NativeRecorderFailureCode,
    readonly snapshot: RecorderSnapshot,
    readonly diagnosticReason?: NativePrepareFailureReason,
  ) {
    super(code);
    this.name = 'NativeRecorderError';
  }
}

const ANDROID_VOICE_RECORDING_OPTIONS = {
  ...RecordingPresets.HIGH_QUALITY,
  bitRate: 256_000,
  isMeteringEnabled: true,
  numberOfChannels: 1,
};

export const IOS_VOICE_RECORDING_OPTIONS = RecordingPresets.HIGH_QUALITY;

const VOICE_RECORDING_OPTIONS = Platform.OS === 'ios'
  ? IOS_VOICE_RECORDING_OPTIONS
  : ANDROID_VOICE_RECORDING_OPTIONS;
const E2E_ENABLED = __DEV__ && process.env.EXPO_PUBLIC_ICAO_AUDIO_E2E === '1';
const NATIVE_MIME_TYPE = 'audio/mp4';

function prepareFailureReason(error: unknown): NativePrepareFailureReason {
  const message = error instanceof Error ? error.message : '';
  if (message.includes('Failed to configure audio session')) return 'audio-session-configuration';
  if (message.includes('Failed to prepare recorder')) return 'native-recorder-prepare';
  return 'unknown-native-prepare';
}

function createSilentWave(durationMs: number) {
  const sampleRate = 16_000;
  const sampleCount = Math.ceil(sampleRate * durationMs / 1_000);
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

export type ExpoRecorderAdapter = RecorderPort;

export async function getMicrophonePermission() {
  return getRecordingPermissionsAsync();
}

export async function requestMicrophonePermission() {
  return requestRecordingPermissionsAsync();
}

export function useExpoRecorderAdapter(): ExpoRecorderAdapter {
  const listeners = useRef(new Set<(event: RecorderRuntimeEvent) => void>());
  const activeContext = useRef<RecordingOperationContext | undefined>(undefined);
  const suppressedTerminalContext = useRef<RecordingOperationContext | undefined>(undefined);
  const recorderRef = useRef<ReturnType<typeof useAudioRecorder> | undefined>(undefined);
  const startPoll = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const startSettlement = useRef<{
    reject: (error: unknown) => void;
    resolve: () => void;
  } | undefined>(undefined);
  const meteringDetected = useRef(false);
  const e2e = useRef({ prepared: false, recording: false, startedAt: 0, uri: undefined as string | undefined });

  const snapshotFromRecorder = useCallback((): RecorderSnapshot => {
    if (E2E_ENABLED) {
      return {
        canRecord: e2e.current.prepared,
        durationMs: e2e.current.recording ? Math.max(0, Date.now() - e2e.current.startedAt) : 0,
        isRecording: e2e.current.recording,
        mediaServicesDidReset: false,
        state: e2e.current.recording ? 'recording' : e2e.current.prepared ? 'prepared' : 'idle',
      };
    }
    try {
      const status = recorderRef.current?.getStatus();
      if (!status) throw new Error('recorder unavailable');
      const isRecording = recorderRef.current?.isRecording === true;
      return {
        canRecord: status.canRecord,
        durationMs: status.durationMillis,
        isRecording,
        mediaServicesDidReset: status.mediaServicesDidReset,
        state: status.mediaServicesDidReset
          ? 'reset'
          : isRecording
            ? 'recording'
            : status.canRecord
              ? 'prepared'
              : 'idle',
      };
    } catch {
      return {
        canRecord: false,
        durationMs: 0,
        isRecording: false,
        mediaServicesDidReset: false,
        state: 'idle',
      };
    }
  }, []);

  const emit = useCallback((event: RecorderRuntimeEvent) => {
    listeners.current.forEach((listener) => listener(event));
  }, []);

  const handleStatus = useCallback((status: RecordingStatus) => {
    const context = activeContext.current;
    const snapshot = snapshotFromRecorder();
    emit({ context, snapshot, type: 'status' });
    const suppressed = suppressedTerminalContext.current;
    if (suppressed
      && context?.operationId === suppressed.operationId
      && context.runtimeEpoch === suppressed.runtimeEpoch
      && (status.mediaServicesDidReset || status.hasError || status.isFinished)) return;
    if (status.mediaServicesDidReset) {
      startSettlement.current?.reject(new NativeRecorderError('recording_media_services_reset', snapshot));
      startSettlement.current = undefined;
      emit({ context, reason: 'media-services-reset', type: 'interrupted' });
      return;
    }
    if (status.hasError) {
      startSettlement.current?.reject(new NativeRecorderError('recording_native_start_failed', snapshot));
      startSettlement.current = undefined;
      emit({ code: 'recording_interrupted', context, type: 'error' });
      return;
    }
    if (status.isFinished) emit({ context, type: 'finished' });
  }, [emit, snapshotFromRecorder]);

  const recorder = useAudioRecorder(VOICE_RECORDING_OPTIONS, handleStatus);
  recorderRef.current = recorder;
  const recorderState = useAudioRecorderState(recorder, 100);
  if (recorderState.isRecording && typeof recorderState.metering === 'number' && recorderState.metering > -160) {
    meteringDetected.current = true;
  }

  const clearStartPoll = () => {
    if (startPoll.current) clearTimeout(startPoll.current);
    startPoll.current = undefined;
  };

  const rawFromNativeUri = (uri: string, recorderDurationMs: number): RawRecording => ({
    format: 'm4a',
    kind: 'native-file',
    meteringDetected: meteringDetected.current,
    mimeType: NATIVE_MIME_TYPE,
    recorderDurationMs,
    recorderMimeType: NATIVE_MIME_TYPE,
    uri,
  });

  useEffect(() => () => {
    clearStartPoll();
    startSettlement.current?.reject(new Error('recording_interrupted'));
    startSettlement.current = undefined;
    listeners.current.clear();
  }, []);

  return {
    async cancel(context) {
      activeContext.current = context;
      suppressedTerminalContext.current = context;
      clearStartPoll();
      startSettlement.current?.reject(new Error('recording_interrupted'));
      startSettlement.current = undefined;
      if (E2E_ENABLED) {
        const uri = e2e.current.uri;
        const durationMs = e2e.current.recording ? Math.max(0, Date.now() - e2e.current.startedAt) : 0;
        e2e.current.prepared = false;
        e2e.current.recording = false;
        return uri ? {
          format: 'wav',
          kind: 'native-file',
          mimeType: 'audio/wav',
          recorderDurationMs: durationMs,
          recorderMimeType: 'audio/wav',
          uri,
        } : undefined;
      }
      let uri: string | undefined;
      let durationMs = Math.max(recorderState.durationMillis, snapshotFromRecorder().durationMs);
      try {
        const snapshot = snapshotFromRecorder();
        if (snapshot.isRecording || snapshot.canRecord) await recorder.stop();
        const status = recorder.getStatus();
        uri = status.url ?? recorder.uri ?? undefined;
        durationMs = Math.max(durationMs, status.durationMillis);
      } catch {
        uri = recorder.uri ?? undefined;
      }
      return uri ? rawFromNativeUri(uri, durationMs) : undefined;
    },
    async dispose() {
      clearStartPoll();
      startSettlement.current?.reject(new Error('recording_interrupted'));
      startSettlement.current = undefined;
      const snapshot = snapshotFromRecorder();
      if (!E2E_ENABLED && (snapshot.isRecording || snapshot.canRecord)) {
        await recorder.stop().catch(() => undefined);
      }
    },
    getSnapshot: snapshotFromRecorder,
    isWeb: false,
    async prepare(context) {
      activeContext.current = context;
      suppressedTerminalContext.current = undefined;
      meteringDetected.current = false;
      if (E2E_ENABLED) {
        e2e.current.prepared = true;
        e2e.current.uri = undefined;
        return;
      }
      try {
        await recorder.prepareToRecordAsync();
      } catch (error) {
        const snapshot = snapshotFromRecorder();
        throw new NativeRecorderError(
          snapshot.mediaServicesDidReset
            ? 'recording_media_services_reset'
            : 'recording_native_prepare_failed',
          snapshot,
          snapshot.mediaServicesDidReset ? undefined : prepareFailureReason(error),
        );
      }
      const snapshot = snapshotFromRecorder();
      if (snapshot.mediaServicesDidReset) throw new NativeRecorderError('recording_media_services_reset', snapshot);
    },
    async requestPermission() {
      const permission = await requestMicrophonePermission();
      return permission.granted;
    },
    start(context) {
      activeContext.current = context;
      if (E2E_ENABLED) {
        if (!e2e.current.prepared) {
          return Promise.reject(new NativeRecorderError('recording_native_start_failed', snapshotFromRecorder()));
        }
        e2e.current.recording = true;
        e2e.current.startedAt = Date.now();
        return Promise.resolve();
      }
      try {
        recorder.record();
      } catch {
        const snapshot = snapshotFromRecorder();
        return Promise.reject(new NativeRecorderError(
          snapshot.mediaServicesDidReset
            ? 'recording_media_services_reset'
            : 'recording_native_start_failed',
          snapshot,
        ));
      }
      return new Promise<void>((resolve, reject) => {
        startSettlement.current = { reject, resolve };
        const poll = () => {
          const snapshot = snapshotFromRecorder();
          emit({ context, snapshot, type: 'status' });
          if (snapshot.mediaServicesDidReset) {
            startSettlement.current = undefined;
            reject(new NativeRecorderError('recording_media_services_reset', snapshot));
            return;
          }
          if (snapshot.isRecording) {
            startSettlement.current = undefined;
            resolve();
            return;
          }
          startPoll.current = setTimeout(poll, 25);
        };
        poll();
      }).finally(clearStartPoll);
    },
    async stop(context) {
      activeContext.current = context;
      if (E2E_ENABLED) {
        if (!e2e.current.recording) throw new Error('record_stop_failed');
        const durationMs = Math.max(1_200, Date.now() - e2e.current.startedAt);
        const file = new File(Paths.cache, `icao-audio-e2e-${Date.now()}.wav`);
        file.write(createSilentWave(durationMs));
        e2e.current.prepared = false;
        e2e.current.recording = false;
        e2e.current.uri = file.uri;
        return {
          format: 'wav',
          kind: 'native-file',
          meteringDetected: false,
          mimeType: 'audio/wav',
          recorderDurationMs: durationMs,
          recorderMimeType: 'audio/wav',
          uri: file.uri,
        };
      }
      const statusBeforeStop = recorder.getStatus();
      const durationBeforeStop = Math.max(recorderState.durationMillis, statusBeforeStop.durationMillis);
      if (statusBeforeStop.mediaServicesDidReset) throw new Error('recording_interrupted');
      await recorder.stop();
      const status = recorder.getStatus();
      if (status.mediaServicesDidReset) throw new Error('recording_interrupted');
      const uri = status.url ?? recorder.uri ?? undefined;
      if (!uri) throw new Error('record_stop_failed');
      return rawFromNativeUri(uri, Math.max(durationBeforeStop, status.durationMillis));
    },
    subscribe(listener) {
      listeners.current.add(listener);
      return () => listeners.current.delete(listener);
    },
  };
}
