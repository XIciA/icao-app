import type { RecordingFailureCode } from './types';

export class RecordingRepositoryError extends Error {
  constructor(readonly code: RecordingFailureCode) {
    super(code);
    this.name = 'RecordingRepositoryError';
  }
}
