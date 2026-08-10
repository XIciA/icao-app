export type RecordingFormat = 'm4a' | 'ogg' | 'wav' | 'webm';

export type RecordingAsset = {
  byteSize: number;
  cardId: string;
  createdAt: string;
  durationMillis: number;
  format: RecordingFormat;
  id: string;
  sessionId: string;
  uri: string;
};

export type RawRecording = {
  durationMillis: number;
  format: RecordingFormat;
  minBytesPerMillisecond: number;
  uri: string;
  webBlob?: Blob;
};

export type RecordingFailureCode =
  | 'microphone_permission_denied'
  | 'microphone_device_missing'
  | 'microphone_device_unavailable'
  | 'record_prepare_failed'
  | 'record_start_failed'
  | 'record_stop_failed'
  | 'recording_browser_unsupported'
  | 'recording_finalization_timeout'
  | 'recording_interrupted'
  | 'recording_too_short'
  | 'recording_file_incomplete'
  | 'recording_asset_missing'
  | 'recording_commit_failed';

export type RecordingFailure = {
  code: RecordingFailureCode;
  message: string;
};
