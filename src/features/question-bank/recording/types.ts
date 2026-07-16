export type RecordingFormat = 'm4a' | 'wav';

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
};

export type RecordingFailureCode =
  | 'microphone_permission_denied'
  | 'record_prepare_failed'
  | 'record_start_failed'
  | 'record_stop_failed'
  | 'recording_too_short'
  | 'recording_file_incomplete'
  | 'recording_asset_missing'
  | 'recording_commit_failed';

export type RecordingFailure = {
  code: RecordingFailureCode;
  message: string;
};
