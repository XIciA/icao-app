import { useEffect, useRef, useState } from 'react';

import type { ExpoRecorderAdapter } from './expo-recorder-adapter';
import type { RawRecording, RecordingFormat } from './types';

type WebRecordingFormat = {
  format: RecordingFormat;
  mimeType: string;
};

const WEB_RECORDING_FORMATS: readonly WebRecordingFormat[] = [
  { format: 'webm', mimeType: 'audio/webm;codecs=opus' },
  { format: 'webm', mimeType: 'audio/webm' },
  { format: 'm4a', mimeType: 'audio/mp4' },
];
const WEB_RECORDING_BITS_PER_SECOND = 128_000;
const MIN_BYTES_PER_MILLISECOND = 0.05;
const CHUNK_INTERVAL_MS = 250;

function stopTracks(stream?: MediaStream) {
  stream?.getTracks().forEach((track) => track.stop());
}

function supportedFormat(): WebRecordingFormat | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  return WEB_RECORDING_FORMATS.find(({ mimeType }) => MediaRecorder.isTypeSupported(mimeType));
}

function formatForMimeType(mimeType: string, fallback: RecordingFormat): RecordingFormat {
  if (mimeType.includes('mp4') || mimeType.includes('m4a')) return 'm4a';
  if (mimeType.includes('webm') || mimeType.includes('ogg')) return 'webm';
  return fallback;
}

async function getAudioStream() {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    throw new Error('microphone_unavailable');
  }
  return navigator.mediaDevices.getUserMedia({ audio: true });
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
  try {
    const stream = await getAudioStream();
    stopTracks(stream);
    return { granted: true };
  } catch {
    return { granted: false };
  }
}

export function useExpoRecorderAdapter(): ExpoRecorderAdapter {
  const recorderRef = useRef<MediaRecorder | undefined>(undefined);
  const streamRef = useRef<MediaStream | undefined>(undefined);
  const grantedStreamRef = useRef<MediaStream | undefined>(undefined);
  const chunksRef = useRef<Blob[]>([]);
  const rawUriRef = useRef<string | undefined>(undefined);
  const startedAtRef = useRef(0);
  const formatRef = useRef<WebRecordingFormat | undefined>(undefined);
  const stopPromiseRef = useRef<Promise<RawRecording> | undefined>(undefined);
  const [durationMillis, setDurationMillis] = useState(0);

  const cleanupPreparedRecorder = () => {
    const recorder = recorderRef.current;
    recorderRef.current = undefined;
    if (recorder && recorder.state !== 'inactive') {
      try {
        recorder.stop();
      } catch {
        // The controller owns the raw asset cleanup. This only releases browser capture resources.
      }
    }
    stopTracks(streamRef.current);
    streamRef.current = undefined;
    chunksRef.current = [];
    setDurationMillis(0);
  };

  useEffect(() => {
    const interval = setInterval(() => {
      if (!recorderRef.current || recorderRef.current.state !== 'recording') return;
      setDurationMillis(Math.max(0, Date.now() - startedAtRef.current));
    }, 100);
    return () => {
      clearInterval(interval);
      cleanupPreparedRecorder();
      stopTracks(grantedStreamRef.current);
      grantedStreamRef.current = undefined;
    };
  }, []);

  return {
    async cancel() {
      if (recorderRef.current?.state === 'recording') {
        try {
          const raw = await this.stop();
          return raw.uri;
        } catch {
          // Fall through to best-effort browser resource cleanup below.
        }
      }
      cleanupPreparedRecorder();
      stopTracks(grantedStreamRef.current);
      grantedStreamRef.current = undefined;
      return rawUriRef.current;
    },
    durationMillis,
    isRecording: () => recorderRef.current?.state === 'recording',
    async prepare() {
      cleanupPreparedRecorder();
      const format = supportedFormat();
      if (!format) throw new Error('record_prepare_failed');

      const stream = grantedStreamRef.current ?? await getAudioStream();
      grantedStreamRef.current = undefined;
      try {
        const recorder = new MediaRecorder(stream, {
          bitsPerSecond: WEB_RECORDING_BITS_PER_SECOND,
          mimeType: format.mimeType,
        });
        recorder.addEventListener('dataavailable', (event) => {
          if (event.data.size > 0) chunksRef.current.push(event.data);
        });
        recorderRef.current = recorder;
        streamRef.current = stream;
        formatRef.current = format;
        rawUriRef.current = undefined;
        chunksRef.current = [];
      } catch (error) {
        stopTracks(stream);
        throw error;
      }
    },
    async requestPermission() {
      try {
        const stream = await getAudioStream();
        stopTracks(grantedStreamRef.current);
        grantedStreamRef.current = stream;
        return true;
      } catch {
        return false;
      }
    },
    start() {
      const recorder = recorderRef.current;
      if (!recorder || recorder.state !== 'inactive') throw new Error('record_start_failed');
      startedAtRef.current = Date.now();
      setDurationMillis(0);
      recorder.start(CHUNK_INTERVAL_MS);
    },
    stop() {
      if (stopPromiseRef.current) return stopPromiseRef.current;
      const recorder = recorderRef.current;
      const stream = streamRef.current;
      const format = formatRef.current;
      if (!recorder || !stream || !format || recorder.state !== 'recording') {
        return Promise.reject(new Error('record_stop_failed'));
      }

      const stopPromise = new Promise<RawRecording>((resolve, reject) => {
        const finish = () => {
          recorderRef.current = undefined;
          streamRef.current = undefined;
          stopTracks(stream);
          const blob = new Blob(chunksRef.current, { type: recorder.mimeType || format.mimeType });
          chunksRef.current = [];
          setDurationMillis(0);
          if (!blob.size) {
            reject(new Error('record_stop_failed'));
            return;
          }
          const uri = URL.createObjectURL(blob);
          rawUriRef.current = uri;
          resolve({
            durationMillis: Math.max(0, Date.now() - startedAtRef.current),
            format: formatForMimeType(blob.type, format.format),
            minBytesPerMillisecond: MIN_BYTES_PER_MILLISECOND,
            uri,
          });
        };
        const fail = () => {
          recorderRef.current = undefined;
          streamRef.current = undefined;
          stopTracks(stream);
          chunksRef.current = [];
          setDurationMillis(0);
          reject(new Error('record_stop_failed'));
        };
        recorder.addEventListener('stop', finish, { once: true });
        recorder.addEventListener('error', fail, { once: true });
        try {
          // Flush the encoder before stopping. Some Chromium versions otherwise
          // emit only a small container header for short, valid recordings.
          recorder.requestData();
          recorder.stop();
        } catch {
          fail();
        }
      }).finally(() => {
        stopPromiseRef.current = undefined;
      });
      stopPromiseRef.current = stopPromise;
      return stopPromise;
    },
  };
}
