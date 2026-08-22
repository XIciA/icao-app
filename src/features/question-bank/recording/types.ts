export type RecordingFormat = 'm4a' | 'ogg' | 'wav' | 'webm';

export type RecordingAsset = {
  byteSize: number;
  cardId: string;
  createdAt: string;
  durationMillis: number;
  format: RecordingFormat;
  id: string;
  mimeType: string;
  recorderMimeType?: string;
  sessionId: string;
  storageKind: 'native-file' | 'web-blob';
  uri: string;
};

type RawRecordingBase = {
  meteringDetected?: boolean;
  mimeType: string;
  recorderDurationMs?: number;
  recorderMimeType?: string;
};

export type RawRecording =
  | (RawRecordingBase & {
    format: 'm4a' | 'wav';
    kind: 'native-file';
    uri: string;
  })
  | (RawRecordingBase & {
    blob: Blob;
    format: 'm4a' | 'ogg' | 'webm';
    kind: 'web-blob';
  });

export type RecordingOperationContext = Readonly<{
  operationId: number;
  runtimeEpoch: number;
}>;

export type RecorderSnapshot = {
  canRecord: boolean;
  durationMs: number;
  isRecording: boolean;
  mediaServicesDidReset: boolean;
  state: 'idle' | 'prepared' | 'recording' | 'reset';
};

export type RecorderRuntimeEvent =
  | { context?: RecordingOperationContext; snapshot: RecorderSnapshot; type: 'status' }
  | { context?: RecordingOperationContext; type: 'finished' }
  | { code?: RecordingFailureCode; context?: RecordingOperationContext; type: 'error' }
  | { context?: RecordingOperationContext; reason: 'media-services-reset' | 'track-ended'; type: 'interrupted' };

export interface RecorderPort {
  readonly isWeb: boolean;
  readonly permissionReady?: boolean;
  cancel(context: RecordingOperationContext): Promise<RawRecording | undefined>;
  dispose(): Promise<void>;
  getSnapshot(): RecorderSnapshot;
  prepare(context: RecordingOperationContext): Promise<void>;
  primePermission?(): Promise<boolean>;
  requestPermission(): Promise<boolean>;
  start(context: RecordingOperationContext): Promise<void>;
  stop(context: RecordingOperationContext): Promise<RawRecording>;
  subscribe(listener: (event: RecorderRuntimeEvent) => void): () => void;
}

export type RecordingFailureCode =
  | 'microphone_permission_denied'
  | 'microphone_device_missing'
  | 'microphone_device_unavailable'
  | 'recording_owner_pause_failed'
  | 'recording_owner_pause_timeout'
  | 'recording_audio_mode_failed'
  | 'recording_audio_mode_timeout'
  | 'recording_native_prepare_failed'
  | 'recording_native_prepare_timeout'
  | 'recording_media_services_reset'
  | 'recording_native_start_failed'
  | 'recording_native_start_timeout'
  | 'record_prepare_failed'
  | 'record_start_failed'
  | 'record_stop_failed'
  | 'recording_stop_timeout'
  | 'recording_browser_unsupported'
  | 'recording_finalization_timeout'
  | 'recording_runtime_tainted'
  | 'recording_interrupted'
  | 'recording_too_short'
  | 'recording_source_missing'
  | 'recording_container_invalid'
  | 'recording_file_incomplete'
  | 'recording_media_duration_mismatch'
  | 'recording_media_unreadable'
  | 'recording_asset_missing'
  | 'recording_commit_failed';

export type RecordingFailure = {
  code: RecordingFailureCode;
  diagnosticId?: string;
  message: string;
};
