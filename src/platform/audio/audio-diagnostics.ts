export type AudioDiagnosticLevel = 'info' | 'warning' | 'error';

export type AudioDiagnosticEvent = {
  at: string;
  attempt?: number;
  byteSize?: number;
  canRecord?: boolean;
  code: string;
  diagnosticId?: string;
  durationMillis?: number;
  elapsedMillis?: number;
  format?: string;
  isRecording?: boolean;
  level: AudioDiagnosticLevel;
  mediaServicesDidReset?: boolean;
  meteringDetected?: boolean;
  owner?: string;
  phase?: string;
  reason?: string;
  recorderState?: string;
  runtimeEpoch?: number;
  scope: 'session' | 'recording' | 'playback' | 'transcription';
};

export type AudioDiagnosticSink = (event: AudioDiagnosticEvent) => void;

const MAX_EVENTS = 100;
const recentEvents: AudioDiagnosticEvent[] = [];
let sink: AudioDiagnosticSink | undefined;

export function emitAudioDiagnostic(event: Omit<AudioDiagnosticEvent, 'at'>) {
  const next = { ...event, at: new Date().toISOString() };
  recentEvents.push(next);
  if (recentEvents.length > MAX_EVENTS) recentEvents.splice(0, recentEvents.length - MAX_EVENTS);
  try {
    sink?.(next);
  } catch {
    // Diagnostics must never become a new audio lifecycle failure source.
  }
  if (__DEV__ && process.env.NODE_ENV !== 'test') {
    const write = next.level === 'error' ? console.error : next.level === 'warning' ? console.warn : console.info;
    write('[audio]', next);
  }
}

export function getRecentAudioDiagnostics() {
  return recentEvents.map((event) => ({ ...event }));
}

export function setAudioDiagnosticSink(next?: AudioDiagnosticSink) {
  sink = next;
}

export function resetAudioDiagnosticsForTests() {
  recentEvents.length = 0;
  sink = undefined;
}
