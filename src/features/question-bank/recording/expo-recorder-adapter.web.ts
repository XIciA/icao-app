import { useCallback, useEffect, useRef, useState } from 'react';

import type { ExpoRecorderAdapter } from './expo-recorder-adapter';
import type {
  RawRecording,
  RecorderRuntimeEvent,
  RecordingFailureCode,
  RecordingFormat,
  RecordingOperationContext,
} from './types';

type WebRecordingFormat = { format: RecordingFormat; mimeType: string };
type RecordingAdapterError = Error & { code: RecordingFailureCode };
type Finalization =
  | { ok: true; raw: RawRecording }
  | { error: RecordingAdapterError; ok: false };

type WebRecordingSession = {
  chunks: Blob[];
  completion: Promise<Finalization>;
  context: RecordingOperationContext;
  finalization?: Finalization;
  finalize: (result: Finalization) => void;
  format?: WebRecordingFormat;
  recorder: MediaRecorder;
  startedAt: number;
  stoppedAt?: number;
  stopPromise?: Promise<RawRecording>;
  stopRequested: boolean;
  stopTimer?: ReturnType<typeof setTimeout>;
  stream: MediaStream;
};

const WEB_RECORDING_FORMATS: readonly WebRecordingFormat[] = [
  { format: 'webm', mimeType: 'audio/webm;codecs=opus' },
  { format: 'webm', mimeType: 'audio/webm' },
  { format: 'ogg', mimeType: 'audio/ogg;codecs=opus' },
  { format: 'm4a', mimeType: 'audio/mp4' },
];
const WEB_RECORDING_BITS_PER_SECOND = 128_000;
const CHUNK_INTERVAL_MS = 250;
const STOP_TIMEOUT_MS = 5_000;
let webPermissionPrimed = false;

function stopTracks(stream?: MediaStream) {
  stream?.getTracks().forEach((track) => track.stop());
}

function recordingError(code: RecordingFailureCode, cause?: unknown): RecordingAdapterError {
  const error = new Error(code) as RecordingAdapterError & { cause?: unknown };
  error.name = 'RecordingAdapterError';
  error.code = code;
  if (cause !== undefined) error.cause = cause;
  return error;
}

function errorName(error: unknown) {
  return typeof (error as { name?: unknown } | undefined)?.name === 'string'
    ? (error as { name: string }).name
    : undefined;
}

function microphoneError(error: unknown): RecordingAdapterError {
  const typedCode = (error as { code?: unknown } | undefined)?.code;
  if (typeof typedCode === 'string') return error as RecordingAdapterError;
  const name = errorName(error);
  if (name === 'NotAllowedError') return recordingError('microphone_permission_denied', error);
  if (name === 'SecurityError' || name === 'NotSupportedError' || name === 'TypeError') {
    return recordingError('recording_browser_unsupported', error);
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    return recordingError('microphone_device_missing', error);
  }
  if (name === 'NotReadableError' || name === 'AbortError') {
    return recordingError('microphone_device_unavailable', error);
  }
  return recordingError('microphone_device_unavailable', error);
}

function assertRecordingCapability() {
  const secureContext = (globalThis as typeof globalThis & { isSecureContext?: boolean }).isSecureContext;
  if (secureContext === false
    || typeof navigator === 'undefined'
    || !navigator.mediaDevices?.getUserMedia
    || typeof MediaRecorder === 'undefined') {
    throw recordingError('recording_browser_unsupported');
  }
}

async function getAudioStream() {
  assertRecordingCapability();
  try {
    return await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (error) {
    throw microphoneError(error);
  }
}

function maySupportMimeType(mimeType: string) {
  if (typeof MediaRecorder.isTypeSupported !== 'function') return true;
  try {
    return MediaRecorder.isTypeSupported(mimeType);
  } catch {
    return true;
  }
}

function createMediaRecorder(stream: MediaStream) {
  assertRecordingCapability();
  let lastError: unknown;
  for (const format of WEB_RECORDING_FORMATS) {
    if (!maySupportMimeType(format.mimeType)) continue;
    try {
      return {
        format,
        recorder: new MediaRecorder(stream, {
          bitsPerSecond: WEB_RECORDING_BITS_PER_SECOND,
          mimeType: format.mimeType,
        }),
      };
    } catch (error) {
      lastError = error;
    }
    try {
      return { format, recorder: new MediaRecorder(stream, { mimeType: format.mimeType }) };
    } catch (error) {
      lastError = error;
    }
  }
  try {
    return { format: undefined, recorder: new MediaRecorder(stream) };
  } catch (error) {
    lastError = error;
    throw recordingError(
      errorName(lastError) === 'NotSupportedError' ? 'recording_browser_unsupported' : 'record_prepare_failed',
      lastError,
    );
  }
}

function formatForMimeType(mimeType: string): RecordingFormat | undefined {
  const normalized = mimeType.toLowerCase().split(';', 1)[0]?.trim();
  if (normalized === 'audio/webm') return 'webm';
  if (normalized === 'audio/ogg') return 'ogg';
  if (normalized === 'audio/mp4' || normalized === 'audio/m4a' || normalized === 'audio/x-m4a') return 'm4a';
  return undefined;
}

function normalizedMimeType(format: 'm4a' | 'ogg' | 'webm') {
  if (format === 'm4a') return 'audio/mp4';
  if (format === 'ogg') return 'audio/ogg';
  return 'audio/webm';
}

function bestEffortStopRecorder(recorder: MediaRecorder) {
  if (recorder.state === 'inactive') return;
  try {
    recorder.stop();
  } catch {
    // Finalization also stops every track.
  }
}

function recorderState(recorder: MediaRecorder) {
  return recorder.state as string;
}

export async function getMicrophonePermission() {
  try {
    const result = await navigator.permissions?.query({ name: 'microphone' as PermissionName });
    return { granted: result?.state === 'granted' };
  } catch {
    return { granted: false };
  }
}

export async function requestMicrophonePermission() {
  let stream: MediaStream | undefined;
  try {
    stream = await getAudioStream();
    return { granted: true };
  } catch (error) {
    const typed = microphoneError(error);
    if (typed.code === 'microphone_permission_denied') return { granted: false };
    throw typed;
  } finally {
    stopTracks(stream);
  }
}

export function useExpoRecorderAdapter(): ExpoRecorderAdapter {
  const listenersRef = useRef(new Set<(event: RecorderRuntimeEvent) => void>());
  const sessionRef = useRef<WebRecordingSession | undefined>(undefined);
  const grantedStreamRef = useRef<MediaStream | undefined>(undefined);
  const mountedRef = useRef(true);
  const permissionMutationRef = useRef(0);
  const [durationMs, setDurationMs] = useState(0);
  const [permissionReady, setPermissionReady] = useState(webPermissionPrimed);

  const emit = useCallback((event: RecorderRuntimeEvent) => {
    listenersRef.current.forEach((listener) => listener(event));
  }, []);

  const updatePermissionReady = useCallback((ready: boolean) => {
    webPermissionPrimed = ready;
    permissionMutationRef.current += 1;
    if (mountedRef.current) setPermissionReady(ready);
  }, []);

  const abandonSession = useCallback((session?: WebRecordingSession) => {
    if (!session || session.finalization) return;
    session.finalize({ error: recordingError('recording_interrupted'), ok: false });
    emit({ context: session.context, reason: 'track-ended', type: 'interrupted' });
    bestEffortStopRecorder(session.recorder);
  }, [emit]);

  const clearCurrentSession = useCallback(() => {
    const session = sessionRef.current;
    sessionRef.current = undefined;
    abandonSession(session);
  }, [abandonSession]);

  const createSession = (
    recorder: MediaRecorder,
    stream: MediaStream,
    context: RecordingOperationContext,
    format?: WebRecordingFormat,
  ): WebRecordingSession => {
    let resolveCompletion!: (result: Finalization) => void;
    const completion = new Promise<Finalization>((resolve) => { resolveCompletion = resolve; });
    const session: WebRecordingSession = {
      chunks: [],
      completion,
      context,
      finalize: () => undefined,
      format,
      recorder,
      startedAt: 0,
      stopRequested: false,
      stream,
    };

    const handleData = (event: BlobEvent) => {
      if (!session.finalization && event.data.size > 0) session.chunks.push(event.data);
    };
    const handleError = (event: Event) => {
      const cause = (event as Event & { error?: unknown }).error ?? event;
      const name = errorName(cause);
      const code = name === 'NotSupportedError' || name === 'SecurityError'
        ? 'recording_browser_unsupported'
        : session.stopRequested ? 'record_stop_failed' : 'recording_interrupted';
      session.finalize({ error: recordingError(code, cause), ok: false });
      emit({ code, context: session.context, type: 'error' });
      bestEffortStopRecorder(recorder);
    };
    const handleStop = () => {
      if (!session.stopRequested) {
        session.finalize({ error: recordingError('recording_interrupted'), ok: false });
        emit({ context: session.context, reason: 'track-ended', type: 'interrupted' });
        return;
      }
      try {
        const chunkMimeType = session.chunks.find((chunk) => Boolean(chunk.type))?.type ?? '';
        const recognized = [recorder.mimeType, chunkMimeType, format?.mimeType]
          .map((mimeType) => ({ format: mimeType ? formatForMimeType(mimeType) : undefined, mimeType }))
          .find((candidate) => candidate.format);
        if (!recognized?.format || recognized.format === 'wav') {
          session.finalize({ error: recordingError('recording_browser_unsupported'), ok: false });
          return;
        }
        const mimeType = normalizedMimeType(recognized.format);
        const blob = new Blob(session.chunks, { type: mimeType });
        if (!blob.size) {
          session.finalize({ error: recordingError('record_stop_failed'), ok: false });
          return;
        }
        session.finalize({
          ok: true,
          raw: {
            blob,
            format: recognized.format,
            kind: 'web-blob',
            mimeType,
            recorderDurationMs: Math.max(0, (session.stoppedAt ?? Date.now()) - session.startedAt),
            recorderMimeType: recognized.mimeType,
          },
        });
      } catch (error) {
        session.finalize({ error: recordingError('record_stop_failed', error), ok: false });
      }
    };
    const handleTrackEnded = () => {
      if (session.stopRequested || session.finalization) return;
      session.finalize({ error: recordingError('recording_interrupted'), ok: false });
      emit({ context: session.context, reason: 'track-ended', type: 'interrupted' });
      bestEffortStopRecorder(recorder);
    };
    const detach = () => {
      recorder.removeEventListener('dataavailable', handleData);
      recorder.removeEventListener('error', handleError);
      recorder.removeEventListener('stop', handleStop);
      stream.getTracks().forEach((track) => track.removeEventListener('ended', handleTrackEnded));
    };

    session.finalize = (result) => {
      if (session.finalization) return;
      session.finalization = result;
      if (session.stopTimer) clearTimeout(session.stopTimer);
      detach();
      stopTracks(stream);
      session.chunks = [];
      if (mountedRef.current) setDurationMs(0);
      resolveCompletion(result);
    };

    recorder.addEventListener('dataavailable', handleData);
    recorder.addEventListener('error', handleError);
    recorder.addEventListener('stop', handleStop);
    stream.getTracks().forEach((track) => track.addEventListener('ended', handleTrackEnded));
    return session;
  };

  const stopSession = (session: WebRecordingSession) => {
    if (session.stopPromise) return session.stopPromise;
    const promise = (async () => {
      if (!session.finalization) {
        if (recorderState(session.recorder) !== 'recording' && recorderState(session.recorder) !== 'paused') {
          session.finalize({ error: recordingError('recording_interrupted'), ok: false });
        } else {
          session.stopRequested = true;
          session.stoppedAt = Date.now();
          session.stopTimer = setTimeout(() => {
            session.finalize({ error: recordingError('recording_finalization_timeout'), ok: false });
            bestEffortStopRecorder(session.recorder);
          }, STOP_TIMEOUT_MS);
          try {
            session.recorder.requestData();
          } catch {
            // stop must still emit the final dataavailable event.
          }
          try {
            session.recorder.stop();
          } catch (error) {
            if (recorderState(session.recorder) !== 'inactive') {
              session.finalize({ error: recordingError('record_stop_failed', error), ok: false });
            }
          }
        }
      }
      const result = await session.completion;
      if (!result.ok) throw result.error;
      return result.raw;
    })();
    session.stopPromise = promise;
    return promise;
  };

  useEffect(() => {
    mountedRef.current = true;
    const listeners = listenersRef.current;
    const queriedAtMutation = permissionMutationRef.current;
    if (typeof navigator !== 'undefined' && navigator.permissions?.query) {
      void navigator.permissions.query({ name: 'microphone' as PermissionName }).then((status) => {
        if (!mountedRef.current || permissionMutationRef.current !== queriedAtMutation) return;
        if (status.state === 'granted') updatePermissionReady(true);
        else if (status.state === 'denied') updatePermissionReady(false);
      }).catch(() => undefined);
    }
    const interval = setInterval(() => {
      const session = sessionRef.current;
      if (!session || session.recorder.state !== 'recording') return;
      setDurationMs(Math.max(0, Date.now() - session.startedAt));
    }, 100);
    return () => {
      mountedRef.current = false;
      clearInterval(interval);
      clearCurrentSession();
      stopTracks(grantedStreamRef.current);
      grantedStreamRef.current = undefined;
      listeners.clear();
    };
  }, [clearCurrentSession, updatePermissionReady]);

  return {
    async cancel() {
      const session = sessionRef.current;
      let raw: RawRecording | undefined;
      if (session && (session.recorder.state === 'recording' || session.recorder.state === 'paused')) {
        raw = await stopSession(session).catch(() => undefined);
      } else if (session?.finalization?.ok) {
        raw = session.finalization.raw;
      } else {
        abandonSession(session);
      }
      if (sessionRef.current === session) sessionRef.current = undefined;
      stopTracks(grantedStreamRef.current);
      grantedStreamRef.current = undefined;
      return raw;
    },
    async dispose() {
      clearCurrentSession();
      stopTracks(grantedStreamRef.current);
      grantedStreamRef.current = undefined;
    },
    getSnapshot: () => {
      const state = sessionRef.current?.recorder.state;
      return {
        canRecord: state === 'inactive' || state === 'recording' || state === 'paused',
        durationMs,
        isRecording: state === 'recording',
        mediaServicesDidReset: false,
        state: state === 'recording' ? 'recording' : state === 'inactive' ? 'prepared' : 'idle',
      };
    },
    isWeb: true,
    permissionReady,
    async prepare(context) {
      clearCurrentSession();
      let stream: MediaStream | undefined;
      try {
        assertRecordingCapability();
        stream = grantedStreamRef.current ?? await getAudioStream();
        grantedStreamRef.current = undefined;
        const { format, recorder } = createMediaRecorder(stream);
        sessionRef.current = createSession(recorder, stream, context, format);
        updatePermissionReady(true);
      } catch (error) {
        stopTracks(stream);
        if ((error as { code?: unknown } | undefined)?.code === 'recording_browser_unsupported') {
          updatePermissionReady(false);
        }
        throw error;
      }
    },
    async primePermission() {
      let stream: MediaStream | undefined;
      try {
        assertRecordingCapability();
        stream = await getAudioStream();
        updatePermissionReady(true);
        return true;
      } catch (error) {
        const typed = microphoneError(error);
        if (typed.code === 'microphone_permission_denied' || typed.code === 'recording_browser_unsupported') {
          updatePermissionReady(false);
        }
        if (typed.code === 'microphone_permission_denied') return false;
        throw typed;
      } finally {
        stopTracks(stream);
      }
    },
    async requestPermission() {
      try {
        assertRecordingCapability();
        const stream = await getAudioStream();
        stopTracks(grantedStreamRef.current);
        grantedStreamRef.current = stream;
        updatePermissionReady(true);
        return true;
      } catch (error) {
        stopTracks(grantedStreamRef.current);
        grantedStreamRef.current = undefined;
        const typed = microphoneError(error);
        if (typed.code === 'microphone_permission_denied' || typed.code === 'recording_browser_unsupported') {
          updatePermissionReady(false);
        }
        if (typed.code === 'microphone_permission_denied') return false;
        throw typed;
      }
    },
    async start(context) {
      const session = sessionRef.current;
      if (!session || session.finalization || recorderState(session.recorder) !== 'inactive') {
        throw recordingError('record_start_failed');
      }
      session.context = context;
      session.startedAt = Date.now();
      try {
        session.recorder.start(CHUNK_INTERVAL_MS);
      } catch (firstError) {
        if (recorderState(session.recorder) === 'inactive') {
          try {
            session.recorder.start();
          } catch (secondError) {
            session.finalize({ error: recordingError('record_start_failed', secondError), ok: false });
            throw recordingError('record_start_failed', secondError);
          }
        } else if (recorderState(session.recorder) !== 'recording') {
          session.finalize({ error: recordingError('record_start_failed', firstError), ok: false });
          throw recordingError('record_start_failed', firstError);
        }
      }
      if (recorderState(session.recorder) !== 'recording') {
        session.finalize({ error: recordingError('record_start_failed'), ok: false });
        throw recordingError('record_start_failed');
      }
      setDurationMs(0);
    },
    stop(context) {
      const session = sessionRef.current;
      if (!session) return Promise.reject(recordingError('record_stop_failed'));
      session.context = context;
      return stopSession(session);
    },
    subscribe(listener) {
      listenersRef.current.add(listener);
      return () => listenersRef.current.delete(listener);
    },
  };
}
