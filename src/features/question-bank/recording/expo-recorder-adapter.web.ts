import { useEffect, useRef, useState } from 'react';

import type { ExpoRecorderAdapter } from './expo-recorder-adapter';
import type { RawRecording, RecordingFailureCode, RecordingFormat } from './types';

type WebRecordingFormat = {
  format: RecordingFormat;
  mimeType: string;
};

type RecordingAdapterError = Error & { code: RecordingFailureCode };
type Finalization =
  | { ok: true; raw: RawRecording }
  | { error: RecordingAdapterError; ok: false };

type WebRecordingSession = {
  chunks: Blob[];
  completion: Promise<Finalization>;
  finalization?: Finalization;
  finalize: (result: Finalization) => void;
  format?: WebRecordingFormat;
  rawTransferred: boolean;
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
  if (name === 'NotAllowedError') {
    return recordingError('microphone_permission_denied', error);
  }
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
      return {
        format,
        recorder: new MediaRecorder(stream, { mimeType: format.mimeType }),
      };
    } catch (error) {
      lastError = error;
    }
  }
  let defaultRecorder: MediaRecorder;
  try {
    defaultRecorder = new MediaRecorder(stream);
  } catch (error) {
    lastError = error;
    throw recordingError(
      errorName(lastError) === 'NotSupportedError' ? 'recording_browser_unsupported' : 'record_prepare_failed',
      lastError,
    );
  }
  return { format: undefined, recorder: defaultRecorder };
}

function formatForMimeType(mimeType: string): RecordingFormat | undefined {
  const normalized = mimeType.toLowerCase().split(';', 1)[0]?.trim();
  if (normalized === 'audio/webm') return 'webm';
  if (normalized === 'audio/ogg') return 'ogg';
  if (normalized === 'audio/mp4'
    || normalized === 'audio/m4a'
    || normalized === 'audio/x-m4a') return 'm4a';
  return undefined;
}

function recorderState(recorder: MediaRecorder) {
  return recorder.state as string;
}

function bestEffortStopRecorder(recorder: MediaRecorder) {
  if (recorder.state === 'inactive') return;
  try {
    recorder.stop();
  } catch {
    // Tracks are also stopped by the finalizer, so capture resources are still released.
  }
}

function abandonSession(session?: WebRecordingSession) {
  if (!session || session.finalization) return;
  session.finalize({ error: recordingError('recording_interrupted'), ok: false });
  bestEffortStopRecorder(session.recorder);
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
  const sessionRef = useRef<WebRecordingSession | undefined>(undefined);
  const grantedStreamRef = useRef<MediaStream | undefined>(undefined);
  const mountedRef = useRef(true);
  const permissionMutationRef = useRef(0);
  const [durationMillis, setDurationMillis] = useState(0);
  const [lifecycleRevision, setLifecycleRevision] = useState(0);
  const [permissionReady, setPermissionReady] = useState(webPermissionPrimed);

  const updatePermissionReady = (ready: boolean) => {
    webPermissionPrimed = ready;
    permissionMutationRef.current += 1;
    if (mountedRef.current) setPermissionReady(ready);
  };

  const clearCurrentSession = () => {
    const session = sessionRef.current;
    sessionRef.current = undefined;
    abandonSession(session);
  };

  const createSession = (
    recorder: MediaRecorder,
    stream: MediaStream,
    format?: WebRecordingFormat,
  ): WebRecordingSession => {
    let resolveCompletion!: (result: Finalization) => void;
    const completion = new Promise<Finalization>((resolve) => { resolveCompletion = resolve; });
    const session: WebRecordingSession = {
      chunks: [],
      completion,
      finalize: () => undefined,
      format,
      rawTransferred: false,
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
        : session.stopRequested
          ? 'record_stop_failed'
          : 'recording_interrupted';
      session.finalize({ error: recordingError(code, cause), ok: false });
      bestEffortStopRecorder(recorder);
    };
    const handleStop = () => {
      if (!session.stopRequested) {
        session.finalize({ error: recordingError('recording_interrupted'), ok: false });
        return;
      }
      try {
        const chunkMimeType = session.chunks.find((chunk) => Boolean(chunk.type))?.type ?? '';
        const recognizedMime = [recorder.mimeType, chunkMimeType, format?.mimeType]
          .map((mimeType) => ({ format: mimeType ? formatForMimeType(mimeType) : undefined, mimeType }))
          .find((candidate) => candidate.format);
        if (!recognizedMime?.format) {
          session.finalize({ error: recordingError('recording_browser_unsupported'), ok: false });
          return;
        }
        const recordingFormat = recognizedMime.format;
        const normalizedMimeType = recordingFormat === 'm4a'
          ? 'audio/mp4'
          : recordingFormat === 'ogg'
            ? 'audio/ogg'
            : 'audio/webm';
        const webBlob = new Blob(session.chunks, { type: normalizedMimeType });
        if (!webBlob.size) {
          session.finalize({ error: recordingError('record_stop_failed'), ok: false });
          return;
        }
        const uri = URL.createObjectURL(webBlob);
        session.finalize({
          ok: true,
          raw: {
            durationMillis: Math.max(0, (session.stoppedAt ?? Date.now()) - session.startedAt),
            format: recordingFormat,
            uri,
            webBlob,
          },
        });
      } catch (error) {
        session.finalize({ error: recordingError('record_stop_failed', error), ok: false });
      }
    };
    const handleTrackEnded = () => {
      if (session.stopRequested || session.finalization) return;
      session.finalize({ error: recordingError('recording_interrupted'), ok: false });
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
      if (mountedRef.current) {
        setDurationMillis(0);
        setLifecycleRevision((current) => current + 1);
      }
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
    session.stopPromise = (async () => {
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
            // The stop event itself must emit the final dataavailable event.
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
    return session.stopPromise;
  };

  useEffect(() => {
    mountedRef.current = true;
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
      setDurationMillis(Math.max(0, Date.now() - session.startedAt));
    }, 100);
    return () => {
      mountedRef.current = false;
      clearInterval(interval);
      const session = sessionRef.current;
      sessionRef.current = undefined;
      abandonSession(session);
      stopTracks(grantedStreamRef.current);
      grantedStreamRef.current = undefined;
    };
  }, []);

  return {
    async cancel() {
      const session = sessionRef.current;
      let rawUri: string | undefined;
      if (session && (session.recorder.state === 'recording' || session.recorder.state === 'paused')) {
        try {
          const raw = await stopSession(session);
          if (!session.rawTransferred) {
            session.rawTransferred = true;
            rawUri = raw.uri;
          }
        } catch {
          // External interruption and failed finalization do not produce a committable raw asset.
        }
      } else if (session?.finalization?.ok && !session.rawTransferred) {
        session.rawTransferred = true;
        rawUri = session.finalization.raw.uri;
      } else {
        abandonSession(session);
      }
      if (sessionRef.current === session) sessionRef.current = undefined;
      stopTracks(grantedStreamRef.current);
      grantedStreamRef.current = undefined;
      return rawUri;
    },
    durationMillis,
    getSnapshot: () => {
      const state = sessionRef.current?.recorder.state;
      return {
        canRecord: state === 'inactive' || state === 'recording' || state === 'paused',
        isRecording: state === 'recording',
        mediaServicesDidReset: false,
        state: state === 'recording' ? 'recording' : state === 'inactive' ? 'prepared' : 'idle',
      };
    },
    isRecording: () => sessionRef.current?.recorder.state === 'recording',
    lifecycleRevision,
    permissionReady,
    async prepare() {
      clearCurrentSession();
      let stream: MediaStream | undefined;
      try {
        assertRecordingCapability();
        stream = grantedStreamRef.current ?? await getAudioStream();
        grantedStreamRef.current = undefined;
        const { format, recorder } = createMediaRecorder(stream);
        sessionRef.current = createSession(recorder, stream, format);
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
    start() {
      const session = sessionRef.current;
      if (!session || session.finalization || recorderState(session.recorder) !== 'inactive') {
        throw recordingError('record_start_failed');
      }
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
      setDurationMillis(0);
    },
    stop() {
      const session = sessionRef.current;
      if (!session) return Promise.reject(recordingError('record_stop_failed'));
      session.rawTransferred = true;
      return stopSession(session);
    },
  };
}
