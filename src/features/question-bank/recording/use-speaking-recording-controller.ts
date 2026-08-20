import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';

import {
  audioSessionOrchestrator,
  emitAudioDiagnostic,
  type AudioLease,
  type AudioSessionError,
} from '@/platform/audio';
import { recordSafeDiagnosticEvent } from '@/platform/diagnostics/safe-diagnostic-store';

import { useExpoRecorderAdapter } from './expo-recorder-adapter';
import { recordingRepository, RecordingRepositoryError } from './recording-repository';
import { initialRecordingState, recordingReducer } from './recording-state-machine';
import type { RecordingAsset, RecordingFailure, RecordingFailureCode } from './types';

const WEB_COMPATIBILITY_FAILURES = new Set<string>([
  'record_prepare_failed',
  'record_start_failed',
  'record_stop_failed',
  'recording_file_incomplete',
  'recording_finalization_timeout',
]);

const KNOWN_RECORDING_FAILURES = new Set<string>([
  'microphone_permission_denied',
  'recording_owner_pause_failed',
  'recording_owner_pause_timeout',
  'recording_audio_mode_failed',
  'recording_audio_mode_timeout',
  'recording_native_prepare_failed',
  'recording_media_services_reset',
  'recording_native_start_failed',
  'record_prepare_failed',
  'record_start_failed',
  'record_stop_failed',
  'recording_too_short',
  'recording_source_missing',
  'recording_container_invalid',
  'recording_file_incomplete',
  'recording_asset_missing',
  'recording_commit_failed',
  'recording_browser_unsupported',
  'microphone_device_missing',
  'microphone_device_unavailable',
  'recording_interrupted',
  'recording_finalization_timeout',
]);

const WEB_PERMISSION_WAIT_MS = 10_000;

function failure(code: RecordingFailureCode, diagnosticId?: string): RecordingFailure {
  const messages: Record<RecordingFailureCode, string> = {
    microphone_permission_denied: '需要麦克风权限才能录音。',
    recording_owner_pause_failed: '上一段音频未能暂停，请稍后重试。',
    recording_owner_pause_timeout: '上一段音频暂停超时，请稍后重试。',
    recording_audio_mode_failed: '录音音频模式切换失败，请稍后重试。',
    recording_audio_mode_timeout: '录音音频模式切换超时，请稍后重试。',
    recording_native_prepare_failed: 'iPhone 录音器准备失败，请稍后重试。',
    recording_media_services_reset: '系统音频服务已重置，请重新录制。',
    recording_native_start_failed: 'iPhone 录音器启动失败，请稍后重试。',
    record_prepare_failed: '录音准备失败，请稍后重试。',
    record_start_failed: '录音启动失败，请稍后重试。',
    record_stop_failed: '录音停止失败，请重新录制。',
    recording_too_short: '录音时间太短，请重新录制。',
    recording_source_missing: '没有找到录音文件，请重新录制。',
    recording_container_invalid: '录音文件格式无效，请重新录制。',
    recording_file_incomplete: '没有生成有效录音文件，请重新录制。',
    recording_asset_missing: '本地录音已失效，请重新录制。',
    recording_commit_failed: '录音保存失败，请重新录制。',
    recording_browser_unsupported: '当前浏览器暂不支持网页录音。',
    microphone_device_missing: '没有检测到可用麦克风。',
    microphone_device_unavailable: '麦克风暂时不可用。',
    recording_interrupted: '录音已中断，请保持页面在前台后重试。',
    recording_finalization_timeout: '录音保存等待超时，请重新录制。',
  };
  return { code, diagnosticId, message: messages[code] };
}

let diagnosticSequence = 0;

function createRecordingDiagnosticId() {
  diagnosticSequence = (diagnosticSequence + 1) % 1_296;
  return `R-${Date.now().toString(36).slice(-5).toUpperCase()}-${diagnosticSequence.toString(36).padStart(2, '0').toUpperCase()}`;
}

function errorCode(error: unknown, fallback: RecordingFailureCode, allowMessageCodes: boolean) {
  if (error instanceof RecordingRepositoryError) return error.code;
  const structuredCode = (error as AudioSessionError | undefined)?.code;
  const candidate = structuredCode ?? (allowMessageCodes && error instanceof Error ? error.message : undefined);
  if (candidate && KNOWN_RECORDING_FAILURES.has(candidate)) return candidate as RecordingFailureCode;
  const code = candidate;
  if (code === 'mode_switch_failed') return 'recording_audio_mode_failed' as const;
  if (code === 'mode_switch_timeout') return 'recording_audio_mode_timeout' as const;
  if (code === 'owner_pause_failed') return 'recording_owner_pause_failed' as const;
  if (code === 'owner_pause_timeout') return 'recording_owner_pause_timeout' as const;
  return fallback;
}

function recordingStageForCode(code: RecordingFailureCode) {
  if (code === 'microphone_permission_denied') return 'permission';
  if (code === 'recording_owner_pause_failed' || code === 'recording_owner_pause_timeout') return 'owner_pause';
  if (code === 'recording_audio_mode_failed' || code === 'recording_audio_mode_timeout') return 'audio_mode';
  if (code === 'recording_native_prepare_failed' || code === 'recording_media_services_reset') return 'native_prepare';
  if (code === 'recording_native_start_failed' || code === 'record_start_failed') return 'native_start';
  return 'recording';
}

function persistRecordingDiagnostic({
  attempt,
  byteSize,
  code,
  correlationId,
  durationMs,
  format,
  level,
  meteringDetected,
  owner,
  snapshot,
  stage,
}: {
  attempt?: number;
  byteSize?: number;
  code: string;
  correlationId: string;
  durationMs?: number;
  format?: 'm4a' | 'wav' | 'unknown';
  level: 'info' | 'warning' | 'error';
  meteringDetected?: boolean;
  owner?: string;
  snapshot?: ReturnType<ReturnType<typeof useExpoRecorderAdapter>['getSnapshot']>;
  stage: string;
}) {
  void recordSafeDiagnosticEvent({
    attempt,
    byteSize,
    canRecord: snapshot?.canRecord,
    code,
    correlationId,
    durationMs,
    feature: 'recording',
    isRecording: snapshot?.isRecording,
    level,
    format,
    mediaServicesDidReset: snapshot?.mediaServicesDidReset,
    meteringDetected,
    owner: owner as 'radio' | 'study' | 'recording' | 'recordingPlayback' | undefined,
    recorderState: snapshot?.state === 'reset' ? 'unknown' : snapshot?.state,
    stage,
  });
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
  const webRecorder = recorder as typeof recorder & {
    lifecycleRevision?: number;
    permissionReady?: boolean;
    primePermission?: () => Promise<boolean>;
  };
  const isWeb = Platform.OS === 'web';
  const [state, dispatch] = useReducer(recordingReducer, recording, initialRecordingState);
  const [compatibilityVisible, setCompatibilityVisible] = useState(false);
  const [permissionPrimerActive, setPermissionPrimerActive] = useState(false);
  const [permissionPrimerWaiting, setPermissionPrimerWaiting] = useState(false);
  const [permissionPrimedNotice, setPermissionPrimedNotice] = useState(false);
  const [webPermissionReady, setWebPermissionReady] = useState(() => !isWeb || webRecorder.permissionReady === true);
  const mounted = useRef(true);
  const stateRef = useRef(state);
  const generation = useRef(0);
  const diagnosticId = useRef<string | undefined>(undefined);
  const pressHeld = useRef(false);
  const recordingLease = useRef<AudioLease | undefined>(undefined);
  const compatibilityFailureStreak = useRef<{ code?: string; count: number }>({ count: 0 });
  const interruptedOperationGeneration = useRef<number | undefined>(undefined);
  const interruptionPromise = useRef<Promise<void> | null>(null);
  const permissionPrimerPromise = useRef<Promise<void> | null>(null);
  const permissionWaitTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const startPromise = useRef<Promise<void> | null>(null);
  const stopPromise = useRef<Promise<void> | null>(null);
  const cancelRef = useRef<() => Promise<void>>(async () => undefined);
  const appInactiveRef = useRef<() => Promise<void>>(async () => cancelRef.current());

  stateRef.current = state;
  const send = useCallback((event: Parameters<typeof recordingReducer>[1]) => {
    if (mounted.current) dispatch(event);
  }, []);

  const clearPermissionWaitTimer = useCallback(() => {
    if (permissionWaitTimer.current) clearTimeout(permissionWaitTimer.current);
    permissionWaitTimer.current = undefined;
  }, []);

  const reportFailure = useCallback((code: RecordingFailureCode, operationDiagnosticId = diagnosticId.current) => {
    if (isWeb) {
      if (code === 'recording_browser_unsupported') {
        compatibilityFailureStreak.current = { count: 0 };
        setCompatibilityVisible(true);
      } else if (WEB_COMPATIBILITY_FAILURES.has(code)) {
        const previous = compatibilityFailureStreak.current;
        const count = previous.code === code ? previous.count + 1 : 1;
        compatibilityFailureStreak.current = { code, count };
        if (count >= 2) setCompatibilityVisible(true);
      } else {
        compatibilityFailureStreak.current = { count: 0 };
      }

      if (
        code === 'microphone_permission_denied'
        || code === 'microphone_device_missing'
        || code === 'microphone_device_unavailable'
        || code === 'recording_browser_unsupported'
      ) {
        setWebPermissionReady(false);
      }
    }
    send({ type: 'FAILED', error: failure(code, operationDiagnosticId) });
  }, [isWeb, send]);

  const releaseRecordingLease = useCallback(async () => {
    const lease = recordingLease.current;
    recordingLease.current = undefined;
    if (!lease) return true;
    try {
      await audioSessionOrchestrator.release(lease);
      return true;
    } catch {
      const operationDiagnosticId = diagnosticId.current;
      emitAudioDiagnostic({
        code: 'recording_audio_mode_failed',
        diagnosticId: operationDiagnosticId,
        level: 'error',
        owner: lease.owner,
        phase: 'lease_release',
        scope: 'recording',
      });
      if (operationDiagnosticId) {
        persistRecordingDiagnostic({
          code: 'recording_audio_mode_failed',
          correlationId: operationDiagnosticId,
          level: 'error',
          owner: lease.owner,
          snapshot: recorder.getSnapshot(),
          stage: 'lease_release',
        });
      }
      return false;
    }
  }, [recorder]);

  const cancel = useCallback(async () => {
    pressHeld.current = false;
    generation.current += 1;
    permissionPrimerPromise.current = null;
    clearPermissionWaitTimer();
    if (isWeb && mounted.current) {
      setPermissionPrimerActive(false);
      setPermissionPrimerWaiting(false);
      setPermissionPrimedNotice(false);
    }
    if (stopPromise.current) {
      await stopPromise.current;
      return;
    }
    const rawUri = await recorder.cancel();
    recordingRepository.discardRaw(rawUri);
    await releaseRecordingLease();
    send({ type: 'CANCELLED' });
    emitAudioDiagnostic({ code: 'recording_cancelled', level: 'info', phase: stateRef.current.phase, scope: 'recording' });
  }, [clearPermissionWaitTimer, isWeb, recorder, releaseRecordingLease, send]);
  cancelRef.current = cancel;

  useEffect(() => {
    send({ type: 'EXTERNAL_ASSET', asset: recording });
  }, [recording, send]);

  useEffect(() => {
    if (isWeb && webRecorder.permissionReady) setWebPermissionReady(true);
  }, [isWeb, webRecorder.permissionReady]);

  const interactionActive = ['requestingPermission', 'preparing', 'recording', 'finalizing'].includes(state.phase);
  useEffect(() => {
    onInteractionChange?.(interactionActive);
  }, [interactionActive, onInteractionChange]);

  useEffect(() => audioSessionOrchestrator.register('recording', {
    deactivate: () => cancelRef.current(),
  }), []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (next !== 'active') void appInactiveRef.current();
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
      const operationDiagnosticId = diagnosticId.current;
      send({ type: 'STOP_REQUESTED' });
      emitAudioDiagnostic({ code: 'record_stop_requested', diagnosticId: operationDiagnosticId, level: 'info', phase: 'finalizing', scope: 'recording' });
      if (operationDiagnosticId) {
        persistRecordingDiagnostic({
          code: 'record_stop_requested',
          correlationId: operationDiagnosticId,
          level: 'info',
          snapshot: recorder.getSnapshot(),
          stage: 'stop',
        });
      }
      try {
        const raw = await recorder.stop();
        rawUri = raw.uri;
        emitAudioDiagnostic({
          code: 'record_stop_completed',
          diagnosticId: operationDiagnosticId,
          durationMillis: raw.durationMillis,
          format: raw.format,
          level: 'info',
          meteringDetected: raw.meteringDetected,
          phase: 'finalizing',
          scope: 'recording',
        });
        if (operationDiagnosticId) {
          persistRecordingDiagnostic({
            code: 'record_stop_completed',
            correlationId: operationDiagnosticId,
            durationMs: raw.durationMillis,
            format: raw.format === 'm4a' || raw.format === 'wav' ? raw.format : 'unknown',
            level: 'info',
            meteringDetected: raw.meteringDetected,
            snapshot: recorder.getSnapshot(),
            stage: 'file_finalization',
          });
        }
        await releaseRecordingLease();
        if (operationGeneration !== generation.current) {
          recordingRepository.discardRaw(raw.uri);
          if (interruptedOperationGeneration.current !== operationGeneration) send({ type: 'CANCELLED' });
          return;
        }
        const asset = await recordingRepository.commitRaw({ ...raw, cardId, diagnosticId: operationDiagnosticId, sessionId });
        if (operationGeneration !== generation.current) {
          recordingRepository.discard(asset);
          if (interruptedOperationGeneration.current !== operationGeneration) send({ type: 'CANCELLED' });
          return;
        }
        onRecorded(asset);
        if (operationDiagnosticId) {
          persistRecordingDiagnostic({
            byteSize: asset.byteSize,
            code: 'recording_committed',
            correlationId: operationDiagnosticId,
            durationMs: asset.durationMillis,
            format: asset.format === 'm4a' || asset.format === 'wav' ? asset.format : 'unknown',
            level: 'info',
            meteringDetected: raw.meteringDetected,
            stage: 'commit',
          });
        }
        compatibilityFailureStreak.current = { count: 0 };
        if (isWeb) {
          setCompatibilityVisible(false);
          setPermissionPrimedNotice(false);
          setWebPermissionReady(true);
        }
        send({ type: 'COMMITTED', asset });
      } catch (error) {
        const failureSnapshot = recorder.getSnapshot();
        const failureOwner = audioSessionOrchestrator.getActiveOwner?.();
        const code = errorCode(error, 'record_stop_failed', isWeb);
        const cancelledUri = await recorder.cancel();
        recordingRepository.discardRaw(rawUri ?? cancelledUri);
        await releaseRecordingLease();
        if (operationGeneration !== generation.current && interruptedOperationGeneration.current === operationGeneration) return;
        reportFailure(code, operationDiagnosticId);
        emitAudioDiagnostic({ code, diagnosticId: operationDiagnosticId, level: 'error', phase: 'finalizing', scope: 'recording' });
        if (operationDiagnosticId) {
          persistRecordingDiagnostic({
            code,
            correlationId: operationDiagnosticId,
            level: 'error',
            owner: failureOwner,
            snapshot: failureSnapshot,
            stage: recordingStageForCode(code),
          });
        }
      }
    })().finally(() => {
      if (interruptedOperationGeneration.current === operationGeneration) interruptedOperationGeneration.current = undefined;
      stopPromise.current = null;
    });
    stopPromise.current = operation;
    return operation;
  }, [cardId, isWeb, onRecorded, recorder, releaseRecordingLease, reportFailure, send, sessionId]);

  const handleAppInactive = useCallback(() => {
    if (interruptionPromise.current) return interruptionPromise.current;
    const phase = stateRef.current.phase;
    if (phase !== 'recording' && phase !== 'finalizing') {
      return cancelRef.current();
    }

    const operationGeneration = generation.current;
    const operationDiagnosticId = diagnosticId.current;
    interruptedOperationGeneration.current = operationGeneration;
    generation.current = operationGeneration + 1;
    pressHeld.current = false;
    clearPermissionWaitTimer();
    if (isWeb) {
      setPermissionPrimerWaiting(false);
      setPermissionPrimedNotice(false);
    }
    if (phase === 'recording') send({ type: 'INTERRUPTED' });
    emitAudioDiagnostic({
      code: 'recording_interrupted',
      diagnosticId: operationDiagnosticId,
      level: 'warning',
      phase,
      scope: 'recording',
    });
    if (operationDiagnosticId) {
      persistRecordingDiagnostic({
        code: 'recording_interrupted',
        correlationId: operationDiagnosticId,
        level: 'error',
        snapshot: recorder.getSnapshot(),
        stage: 'interruption',
      });
    }

    const operation = (async () => {
      try {
        if (stopPromise.current) {
          await stopPromise.current;
        } else {
          const rawUri = await recorder.cancel();
          recordingRepository.discardRaw(rawUri);
          await releaseRecordingLease();
        }
      } finally {
        if (mounted.current && generation.current === operationGeneration + 1) {
          reportFailure('recording_interrupted');
        }
      }
    })().finally(() => {
      if (interruptedOperationGeneration.current === operationGeneration) {
        interruptedOperationGeneration.current = undefined;
      }
      if (interruptionPromise.current === operation) interruptionPromise.current = null;
    });
    interruptionPromise.current = operation;
    return operation;
  }, [clearPermissionWaitTimer, isWeb, recorder, releaseRecordingLease, reportFailure, send]);
  appInactiveRef.current = handleAppInactive;

  useEffect(() => {
    if (state.phase !== 'recording' || recorder.isRecording() || interruptionPromise.current) return;
    if (!isWeb) {
      send({ type: 'INTERRUPTED' });
      emitAudioDiagnostic({ code: 'recording_interrupted', level: 'warning', phase: 'recording', scope: 'recording' });
      void stop();
      return;
    }
    send({ type: 'INTERRUPTED' });
    emitAudioDiagnostic({ code: 'recording_interrupted', level: 'warning', phase: 'recording', scope: 'recording' });
    const operation = stop().finally(() => {
      if (interruptionPromise.current === operation) interruptionPromise.current = null;
    });
    interruptionPromise.current = operation;
  }, [isWeb, recorder, send, state.phase, stop, webRecorder.lifecycleRevision]);

  const primePermission = useCallback(() => {
    if (!isWeb) return Promise.resolve();
    if (permissionPrimerPromise.current) return permissionPrimerPromise.current;
    if (webPermissionReady || webRecorder.permissionReady) {
      setWebPermissionReady(true);
      setPermissionPrimedNotice(true);
      return Promise.resolve();
    }

    const operationGeneration = generation.current + 1;
    generation.current = operationGeneration;
    send({ type: 'REQUEST_START' });
    setPermissionPrimerActive(true);
    setPermissionPrimerWaiting(false);
    setPermissionPrimedNotice(false);
    clearPermissionWaitTimer();
    permissionWaitTimer.current = setTimeout(() => {
      if (mounted.current && operationGeneration === generation.current) setPermissionPrimerWaiting(true);
    }, WEB_PERMISSION_WAIT_MS);

    const operation = (async () => {
      try {
        const granted = webRecorder.primePermission
          ? await webRecorder.primePermission()
          : await recorder.requestPermission();
        if (operationGeneration !== generation.current) return;
        if (!granted) {
          reportFailure('microphone_permission_denied');
          return;
        }
        setWebPermissionReady(true);
        setPermissionPrimedNotice(true);
        compatibilityFailureStreak.current = { count: 0 };
        send({ type: 'PERMISSION_PRIMED' });
      } catch (error) {
        if (operationGeneration !== generation.current) return;
        const code = errorCode(error, 'microphone_device_unavailable', isWeb);
        reportFailure(code);
        emitAudioDiagnostic({ code, level: 'warning', phase: 'requestingPermission', scope: 'recording' });
      } finally {
        if (operationGeneration === generation.current) {
          clearPermissionWaitTimer();
          setPermissionPrimerWaiting(false);
        }
      }
    })().finally(() => {
      if (permissionPrimerPromise.current === operation) {
        permissionPrimerPromise.current = null;
        if (mounted.current) setPermissionPrimerActive(false);
      }
    });
    permissionPrimerPromise.current = operation;
    return operation;
  }, [clearPermissionWaitTimer, isWeb, recorder, reportFailure, send, webPermissionReady, webRecorder]);

  const start = useCallback(() => {
    const operation = (async () => {
      const operationGeneration = generation.current + 1;
      generation.current = operationGeneration;
      const operationDiagnosticId = createRecordingDiagnosticId();
      diagnosticId.current = operationDiagnosticId;
      let prepared = false;
      let stage = 'permission';
      let attempt = 1;
      const startedAt = Date.now();
      send({ type: 'REQUEST_START' });
      if (isWeb) setPermissionPrimedNotice(false);
      emitAudioDiagnostic({ code: 'record_start_requested', diagnosticId: operationDiagnosticId, level: 'info', phase: 'requestingPermission', scope: 'recording' });
      persistRecordingDiagnostic({
        code: 'record_start_requested',
        correlationId: operationDiagnosticId,
        level: 'info',
        stage: 'permission',
      });
      try {
        const granted = await recorder.requestPermission();
        if (operationGeneration !== generation.current || !pressHeld.current) {
          if (isWeb) {
            const rawUri = await recorder.cancel();
            recordingRepository.discardRaw(rawUri);
          }
          send({ type: 'CANCELLED' });
          return;
        }
        if (!granted) {
          const code = 'microphone_permission_denied' as const;
          reportFailure(code, operationDiagnosticId);
          emitAudioDiagnostic({
            code,
            diagnosticId: operationDiagnosticId,
            elapsedMillis: Date.now() - startedAt,
            level: 'warning',
            phase: 'permission',
            scope: 'recording',
          });
          persistRecordingDiagnostic({
            code,
            correlationId: operationDiagnosticId,
            durationMs: Date.now() - startedAt,
            level: 'error',
            stage: 'permission',
          });
          return;
        }
        if (isWeb) setWebPermissionReady(true);
        send({ type: 'PERMISSION_GRANTED' });
        stage = 'audio_session';
        const prepareAndStart = async () => {
          recordingLease.current = await audioSessionOrchestrator.acquire('recording', 'recording-start');
          if (operationGeneration !== generation.current || !pressHeld.current) {
            const rawUri = await recorder.cancel();
            recordingRepository.discardRaw(rawUri);
            if (!await releaseRecordingLease()) {
              throw Object.assign(new Error('recording_audio_mode_failed'), { code: 'recording_audio_mode_failed' });
            }
            send({ type: 'CANCELLED' });
            return false;
          }
          stage = 'native_prepare';
          emitAudioDiagnostic({
            attempt,
            code: 'record_native_prepare_requested',
            diagnosticId: operationDiagnosticId,
            elapsedMillis: Date.now() - startedAt,
            level: 'info',
            owner: audioSessionOrchestrator.getActiveOwner?.(),
            phase: stage,
            scope: 'recording',
          });
          persistRecordingDiagnostic({
            attempt,
            code: 'record_native_prepare_requested',
            correlationId: operationDiagnosticId,
            durationMs: Date.now() - startedAt,
            level: 'info',
            owner: audioSessionOrchestrator.getActiveOwner?.(),
            stage,
          });
          await recorder.prepare();
          prepared = true;
          const preparedSnapshot = recorder.getSnapshot();
          emitAudioDiagnostic({
            attempt,
            canRecord: preparedSnapshot.canRecord,
            code: 'record_native_prepare_completed',
            diagnosticId: operationDiagnosticId,
            elapsedMillis: Date.now() - startedAt,
            isRecording: preparedSnapshot.isRecording,
            level: 'info',
            mediaServicesDidReset: preparedSnapshot.mediaServicesDidReset,
            owner: audioSessionOrchestrator.getActiveOwner?.(),
            phase: stage,
            recorderState: preparedSnapshot.state,
            scope: 'recording',
          });
          persistRecordingDiagnostic({
            attempt,
            code: 'record_native_prepare_completed',
            correlationId: operationDiagnosticId,
            durationMs: Date.now() - startedAt,
            level: 'info',
            owner: audioSessionOrchestrator.getActiveOwner?.(),
            snapshot: preparedSnapshot,
            stage,
          });
          if (operationGeneration !== generation.current || !pressHeld.current) {
            const rawUri = await recorder.cancel();
            recordingRepository.discardRaw(rawUri);
            await releaseRecordingLease();
            send({ type: 'CANCELLED' });
            return false;
          }
          stage = 'native_start';
          recorder.start();
          return true;
        };

        try {
          if (!await prepareAndStart()) return;
        } catch (error) {
          const code = errorCode(
            error,
            isWeb
              ? prepared ? 'record_start_failed' : 'record_prepare_failed'
              : prepared ? 'recording_native_start_failed' : 'recording_native_prepare_failed',
            isWeb,
          );
          if (!isWeb && code === 'recording_media_services_reset' && attempt === 1) {
            const snapshot = recorder.getSnapshot();
            emitAudioDiagnostic({
              attempt,
              canRecord: snapshot.canRecord,
              code: 'recording_controlled_recovery',
              diagnosticId: operationDiagnosticId,
              elapsedMillis: Date.now() - startedAt,
              isRecording: snapshot.isRecording,
              level: 'warning',
              mediaServicesDidReset: snapshot.mediaServicesDidReset,
              owner: audioSessionOrchestrator.getActiveOwner?.(),
              phase: stage,
              recorderState: snapshot.state,
              scope: 'recording',
            });
            persistRecordingDiagnostic({
              attempt,
              code: 'recording_controlled_recovery',
              correlationId: operationDiagnosticId,
              durationMs: Date.now() - startedAt,
              level: 'warning',
              owner: audioSessionOrchestrator.getActiveOwner?.(),
              snapshot,
              stage,
            });
            const rawUri = await recorder.cancel();
            recordingRepository.discardRaw(rawUri);
            await releaseRecordingLease();
            if (operationGeneration !== generation.current || !pressHeld.current) {
              send({ type: 'CANCELLED' });
              return;
            }
            prepared = false;
            attempt = 2;
            stage = 'audio_session';
            if (!await prepareAndStart()) return;
          } else {
            throw error;
          }
        }
        if (operationGeneration !== generation.current || !pressHeld.current) {
          if (isWeb) {
            const rawUri = await recorder.cancel();
            recordingRepository.discardRaw(rawUri);
          }
          await releaseRecordingLease();
          send({ type: 'CANCELLED' });
          return;
        }
        send({ type: 'RECORDING_STARTED' });
        const snapshot = recorder.getSnapshot();
        emitAudioDiagnostic({
          attempt,
          canRecord: snapshot.canRecord,
          code: 'recording_started',
          diagnosticId: operationDiagnosticId,
          elapsedMillis: Date.now() - startedAt,
          isRecording: snapshot.isRecording,
          level: 'info',
          mediaServicesDidReset: snapshot.mediaServicesDidReset,
          owner: audioSessionOrchestrator.getActiveOwner?.(),
          phase: 'recording',
          recorderState: snapshot.state,
          scope: 'recording',
        });
        persistRecordingDiagnostic({
          attempt,
          code: 'recording_started',
          correlationId: operationDiagnosticId,
          durationMs: Date.now() - startedAt,
          level: 'info',
          owner: audioSessionOrchestrator.getActiveOwner?.(),
          snapshot,
          stage: 'recording',
        });
      } catch (error) {
        const failureSnapshot = recorder.getSnapshot();
        const failureOwner = audioSessionOrchestrator.getActiveOwner?.();
        const wasRecording = recorder.isRecording();
        const code = errorCode(
          error,
          isWeb
            ? prepared || wasRecording ? 'record_start_failed' : 'record_prepare_failed'
            : prepared || wasRecording ? 'recording_native_start_failed' : 'recording_native_prepare_failed',
          isWeb,
        );
        const rawUri = await recorder.cancel();
        recordingRepository.discardRaw(rawUri);
        await releaseRecordingLease();
        reportFailure(code, operationDiagnosticId);
        emitAudioDiagnostic({
          attempt,
          canRecord: failureSnapshot.canRecord,
          code,
          diagnosticId: operationDiagnosticId,
          elapsedMillis: Date.now() - startedAt,
          isRecording: failureSnapshot.isRecording,
          level: 'error',
          mediaServicesDidReset: failureSnapshot.mediaServicesDidReset,
          owner: failureOwner,
          phase: recordingStageForCode(code),
          recorderState: failureSnapshot.state,
          scope: 'recording',
        });
        persistRecordingDiagnostic({
          attempt,
          code,
          correlationId: operationDiagnosticId,
          durationMs: Date.now() - startedAt,
          level: 'error',
          owner: failureOwner,
          snapshot: failureSnapshot,
          stage: recordingStageForCode(code),
        });
      }
    })().finally(() => {
      startPromise.current = null;
    });
    startPromise.current = operation;
    return operation;
  }, [isWeb, recorder, releaseRecordingLease, reportFailure, send]);

  const pressIn = useCallback(() => {
    if (permissionPrimerPromise.current || interruptionPromise.current || startPromise.current || stopPromise.current) return;
    if (isWeb && !webPermissionReady && !webRecorder.permissionReady) {
      pressHeld.current = false;
      void primePermission();
      return;
    }
    pressHeld.current = true;
    startPromise.current = Promise.resolve().then(start);
  }, [isWeb, primePermission, start, webPermissionReady, webRecorder.permissionReady]);

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
    compatibilityVisible,
    dismissCompatibility: () => setCompatibilityVisible(false),
    interactionActive,
    permissionDenied: state.error?.code === 'microphone_permission_denied',
    permissionPrimerActive: isWeb && permissionPrimerActive,
    permissionPrimedNotice: isWeb && permissionPrimedNotice,
    permissionPrimerRequired: isWeb && !webPermissionReady && !webRecorder.permissionReady,
    permissionPrimerWaiting: isWeb && permissionPrimerWaiting,
    phase: state.phase,
    primePermission,
    pressIn,
    pressOut,
    replacing: state.replacing,
    cancelPermissionPrimer: cancel,
    async retryPermission() {
      if (isWeb) {
        await primePermission();
        return;
      }
      const granted = await recorder.requestPermission();
      if (granted) send({ type: 'CANCELLED' });
    },
  };
}
