import { useCallback, useEffect, useReducer, useRef } from 'react';
import { AppState } from 'react-native';

import {
  audioSessionOrchestrator,
  emitAudioDiagnostic,
  type AudioLease,
  type AudioSessionError,
} from '@/platform/audio';

import { useExpoRecorderAdapter } from './expo-recorder-adapter';
import { recordingRepository, RecordingRepositoryError } from './recording-repository';
import { initialRecordingState, recordingReducer } from './recording-state-machine';
import type { RecordingAsset, RecordingFailure, RecordingFailureCode } from './types';

function failure(code: RecordingFailureCode): RecordingFailure {
  const messages: Record<RecordingFailureCode, string> = {
    microphone_permission_denied: '需要麦克风权限才能录音。',
    record_prepare_failed: '录音准备失败，请稍后重试。',
    record_start_failed: '录音启动失败，请稍后重试。',
    record_stop_failed: '录音停止失败，请重新录制。',
    recording_too_short: '录音时间太短，请重新录制。',
    recording_file_incomplete: '没有生成有效录音文件，请重新录制。',
    recording_asset_missing: '本地录音已失效，请重新录制。',
    recording_commit_failed: '录音保存失败，请重新录制。',
  };
  return { code, message: messages[code] };
}

function errorCode(error: unknown, fallback: RecordingFailureCode) {
  if (error instanceof RecordingRepositoryError) return error.code;
  const code = (error as AudioSessionError | undefined)?.code;
  if (code === 'mode_switch_failed' || code === 'owner_pause_failed' || code === 'owner_pause_timeout') {
    return 'record_prepare_failed' as const;
  }
  return fallback;
}

export function useSpeakingRecordingController({
  cardId,
  onClear,
  onInteractionChange,
  onRecorded,
  recording,
  sessionId,
}: {
  cardId: string;
  onClear: () => void;
  onInteractionChange?: (active: boolean) => void;
  onRecorded: (recording: RecordingAsset) => void;
  recording?: RecordingAsset;
  sessionId: string;
}) {
  const recorder = useExpoRecorderAdapter();
  const [state, dispatch] = useReducer(recordingReducer, recording, initialRecordingState);
  const mounted = useRef(true);
  const stateRef = useRef(state);
  const generation = useRef(0);
  const pressHeld = useRef(false);
  const recordingLease = useRef<AudioLease | undefined>(undefined);
  const startPromise = useRef<Promise<void> | null>(null);
  const stopPromise = useRef<Promise<void> | null>(null);
  const cancelRef = useRef<() => Promise<void>>(async () => undefined);

  stateRef.current = state;
  const send = useCallback((event: Parameters<typeof recordingReducer>[1]) => {
    if (mounted.current) dispatch(event);
  }, []);

  const releaseRecordingLease = useCallback(async () => {
    const lease = recordingLease.current;
    recordingLease.current = undefined;
    if (!lease) return;
    await audioSessionOrchestrator.release(lease).catch(() => undefined);
  }, []);

  const cancel = useCallback(async () => {
    pressHeld.current = false;
    generation.current += 1;
    if (stopPromise.current) {
      await stopPromise.current;
      return;
    }
    const rawUri = await recorder.cancel();
    recordingRepository.discardRaw(rawUri);
    await releaseRecordingLease();
    send({ type: 'CANCELLED' });
    emitAudioDiagnostic({ code: 'recording_cancelled', level: 'info', phase: stateRef.current.phase, scope: 'recording' });
  }, [recorder, releaseRecordingLease, send]);
  cancelRef.current = cancel;

  useEffect(() => {
    send({ type: 'EXTERNAL_ASSET', asset: recording });
  }, [recording, send]);

  const interactionActive = ['requestingPermission', 'preparing', 'recording', 'finalizing'].includes(state.phase);
  useEffect(() => {
    onInteractionChange?.(interactionActive);
  }, [interactionActive, onInteractionChange]);

  useEffect(() => audioSessionOrchestrator.register('recording', {
    deactivate: () => cancelRef.current(),
  }), []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (next !== 'active') void cancelRef.current();
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      void cancelRef.current();
    };
  }, []);

  useEffect(() => () => onInteractionChange?.(false), [onInteractionChange]);

  const stop = useCallback(() => {
    if (stopPromise.current) return stopPromise.current;
    const operationGeneration = generation.current;
    const operation = (async () => {
      let rawUri: string | undefined;
      send({ type: 'STOP_REQUESTED' });
      emitAudioDiagnostic({ code: 'record_stop_requested', level: 'info', phase: 'finalizing', scope: 'recording' });
      try {
        const raw = await recorder.stop();
        rawUri = raw.uri;
        await releaseRecordingLease();
        if (operationGeneration !== generation.current) {
          recordingRepository.discardRaw(raw.uri);
          send({ type: 'CANCELLED' });
          return;
        }
        const asset = await recordingRepository.commitRaw({ ...raw, cardId, sessionId });
        if (operationGeneration !== generation.current) {
          recordingRepository.discard(asset);
          send({ type: 'CANCELLED' });
          return;
        }
        onRecorded(asset);
        send({ type: 'COMMITTED', asset });
      } catch (error) {
        const cancelledUri = await recorder.cancel();
        recordingRepository.discardRaw(rawUri ?? cancelledUri);
        await releaseRecordingLease();
        const code = errorCode(error, 'record_stop_failed');
        send({ type: 'FAILED', error: failure(code) });
        emitAudioDiagnostic({ code, level: 'error', phase: 'finalizing', scope: 'recording' });
      }
    })().finally(() => {
      stopPromise.current = null;
    });
    stopPromise.current = operation;
    return operation;
  }, [cardId, onRecorded, recorder, releaseRecordingLease, send, sessionId]);

  useEffect(() => {
    if (state.phase !== 'recording' || recorder.isRecording()) return;
    send({ type: 'INTERRUPTED' });
    emitAudioDiagnostic({ code: 'recording_interrupted', level: 'warning', phase: 'recording', scope: 'recording' });
    void stop();
  }, [recorder, send, state.phase, stop]);

  const start = useCallback(() => {
    const operation = (async () => {
      const operationGeneration = generation.current + 1;
      generation.current = operationGeneration;
      let prepared = false;
      send({ type: 'REQUEST_START' });
      emitAudioDiagnostic({ code: 'record_start_requested', level: 'info', phase: 'requestingPermission', scope: 'recording' });
      try {
        const granted = await recorder.requestPermission();
        if (operationGeneration !== generation.current || !pressHeld.current) {
          send({ type: 'CANCELLED' });
          return;
        }
        if (!granted) {
          send({ type: 'FAILED', error: failure('microphone_permission_denied') });
          return;
        }
        send({ type: 'PERMISSION_GRANTED' });
        recordingLease.current = await audioSessionOrchestrator.acquire('recording', 'recording-start');
        if (operationGeneration !== generation.current || !pressHeld.current) {
          await releaseRecordingLease();
          send({ type: 'CANCELLED' });
          return;
        }
        await recorder.prepare();
        prepared = true;
        if (operationGeneration !== generation.current || !pressHeld.current) {
          const rawUri = await recorder.cancel();
          recordingRepository.discardRaw(rawUri);
          await releaseRecordingLease();
          send({ type: 'CANCELLED' });
          return;
        }
        recorder.start();
        send({ type: 'RECORDING_STARTED' });
        emitAudioDiagnostic({ code: 'recording_started', level: 'info', phase: 'recording', scope: 'recording' });
      } catch (error) {
        const rawUri = await recorder.cancel();
        recordingRepository.discardRaw(rawUri);
        await releaseRecordingLease();
        const code = errorCode(error, prepared || recorder.isRecording() ? 'record_start_failed' : 'record_prepare_failed');
        send({ type: 'FAILED', error: failure(code) });
        emitAudioDiagnostic({ code, level: 'error', phase: 'preparing', scope: 'recording' });
      }
    })().finally(() => {
      startPromise.current = null;
    });
    startPromise.current = operation;
    return operation;
  }, [recorder, releaseRecordingLease, send]);

  const pressIn = useCallback(() => {
    pressHeld.current = true;
    startPromise.current = Promise.resolve().then(start);
  }, [start]);

  const pressOut = useCallback(async () => {
    pressHeld.current = false;
    await startPromise.current;
    if (recorder.isRecording()) await stop();
  }, [recorder, stop]);

  return {
    asset: state.asset,
    beginReplacement: () => send({ type: 'BEGIN_REPLACEMENT' }),
    cancelReplacement: () => send({ type: 'CANCELLED' }),
    clear() {
      onClear();
      send({ type: 'CLEAR' });
    },
    durationMillis: recorder.durationMillis,
    error: state.error,
    interactionActive,
    permissionDenied: state.error?.code === 'microphone_permission_denied',
    phase: state.phase,
    pressIn,
    pressOut,
    replacing: state.replacing,
    async retryPermission() {
      const granted = await recorder.requestPermission();
      if (granted) send({ type: 'CANCELLED' });
    },
  };
}
