import { initialRecordingState, recordingReducer } from '../recording-state-machine';
import type { RecordingAsset } from '../types';

const original: RecordingAsset = {
  byteSize: 64_000,
  cardId: 'card-1',
  createdAt: '2026-07-16T00:00:00.000Z',
  durationMillis: 2_000,
  format: 'wav',
  id: 'recording-1',
  sessionId: 'session-1',
  uri: 'file:///recording-1.wav',
};

describe('recording state machine', () => {
  it('moves through the explicit happy path', () => {
    let state = initialRecordingState();
    state = recordingReducer(state, { type: 'REQUEST_START' });
    state = recordingReducer(state, { type: 'PERMISSION_GRANTED' });
    state = recordingReducer(state, { type: 'RECORDING_STARTED' });
    state = recordingReducer(state, { type: 'STOP_REQUESTED' });
    state = recordingReducer(state, { type: 'COMMITTED', asset: original });

    expect(state).toEqual({ asset: original, phase: 'ready', replacing: false });
  });

  it('ignores out-of-order lifecycle events', () => {
    const idle = initialRecordingState();
    expect(recordingReducer(idle, { type: 'RECORDING_STARTED' })).toBe(idle);
    expect(recordingReducer(idle, { type: 'STOP_REQUESTED' })).toBe(idle);
    expect(recordingReducer(idle, { type: 'COMMITTED', asset: original })).toBe(idle);
    expect(recordingReducer(idle, { type: 'FAILED', error: { code: 'record_stop_failed', message: 'failed' } })).toBe(idle);

    const requesting = recordingReducer(idle, { type: 'REQUEST_START' });
    expect(recordingReducer(requesting, { type: 'REQUEST_START' })).toBe(requesting);
    expect(recordingReducer(requesting, { type: 'CLEAR' })).toBe(requesting);
  });

  it('finalizes an explicit native interruption and keeps repeated stop idempotent', () => {
    let state = initialRecordingState();
    state = recordingReducer(state, { type: 'REQUEST_START' });
    state = recordingReducer(state, { type: 'PERMISSION_GRANTED' });
    state = recordingReducer(state, { type: 'RECORDING_STARTED' });
    state = recordingReducer(state, { type: 'INTERRUPTED' });
    expect(state.phase).toBe('finalizing');
    expect(recordingReducer(state, { type: 'STOP_REQUESTED' })).toBe(state);
  });

  it('keeps the previous asset when replacement fails or is cancelled', () => {
    let state = recordingReducer(initialRecordingState(original), { type: 'BEGIN_REPLACEMENT' });
    state = recordingReducer(state, { type: 'REQUEST_START' });
    state = recordingReducer(state, { type: 'FAILED', error: { code: 'record_start_failed', message: 'failed' } });
    expect(state).toEqual(expect.objectContaining({ asset: original, phase: 'ready', replacing: false }));

    state = recordingReducer(recordingReducer(state, { type: 'BEGIN_REPLACEMENT' }), { type: 'CANCELLED' });
    expect(state).toEqual({ asset: original, phase: 'ready', replacing: false });
  });

  it('does not let external props overwrite an active recording operation', () => {
    const active = recordingReducer(recordingReducer(initialRecordingState(), { type: 'REQUEST_START' }), { type: 'PERMISSION_GRANTED' });
    expect(recordingReducer(active, { type: 'EXTERNAL_ASSET', asset: original })).toBe(active);
  });
});
