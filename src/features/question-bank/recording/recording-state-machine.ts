import type { RecordingAsset, RecordingFailure } from './types';

export type RecordingPhase = 'idle' | 'requestingPermission' | 'preparing' | 'recording' | 'finalizing' | 'ready' | 'error';

export type RecordingState = {
  asset?: RecordingAsset;
  error?: RecordingFailure;
  phase: RecordingPhase;
  replacing: boolean;
};

export type RecordingEvent =
  | { type: 'EXTERNAL_ASSET'; asset?: RecordingAsset }
  | { type: 'BEGIN_REPLACEMENT' }
  | { type: 'REQUEST_START' }
  | { type: 'PERMISSION_GRANTED' }
  | { type: 'PERMISSION_PRIMED' }
  | { type: 'RECORDING_STARTED' }
  | { type: 'INTERRUPTED' }
  | { type: 'STOP_REQUESTED' }
  | { type: 'COMMITTED'; asset: RecordingAsset }
  | { type: 'FAILED'; error: RecordingFailure }
  | { type: 'CANCELLED' }
  | { type: 'CLEAR' };

export function initialRecordingState(asset?: RecordingAsset): RecordingState {
  return { asset, phase: asset ? 'ready' : 'idle', replacing: false };
}

export function recordingReducer(state: RecordingState, event: RecordingEvent): RecordingState {
  switch (event.type) {
    case 'EXTERNAL_ASSET':
      if (['requestingPermission', 'preparing', 'recording', 'finalizing'].includes(state.phase)) return state;
      return { asset: event.asset, phase: event.asset ? 'ready' : 'idle', replacing: false };
    case 'BEGIN_REPLACEMENT':
      return state.phase === 'ready' && state.asset ? { ...state, error: undefined, phase: 'idle', replacing: true } : state;
    case 'REQUEST_START':
      if (!['idle', 'ready', 'error'].includes(state.phase)) return state;
      return { ...state, error: undefined, phase: 'requestingPermission', replacing: state.replacing || Boolean(state.asset) };
    case 'PERMISSION_GRANTED':
      return state.phase === 'requestingPermission' ? { ...state, phase: 'preparing' } : state;
    case 'PERMISSION_PRIMED':
      if (state.phase !== 'requestingPermission') return state;
      return {
        asset: state.asset,
        phase: state.asset && !state.replacing ? 'ready' : 'idle',
        replacing: state.replacing,
      };
    case 'RECORDING_STARTED':
      return state.phase === 'preparing' ? { ...state, phase: 'recording' } : state;
    case 'INTERRUPTED':
      return state.phase === 'recording' ? { ...state, phase: 'finalizing' } : state;
    case 'STOP_REQUESTED':
      return state.phase === 'recording' ? { ...state, phase: 'finalizing' } : state;
    case 'COMMITTED':
      return state.phase === 'finalizing' ? { asset: event.asset, phase: 'ready', replacing: false } : state;
    case 'FAILED':
      if (!['requestingPermission', 'preparing', 'recording', 'finalizing'].includes(state.phase)) return state;
      return state.asset
        ? { ...state, error: event.error, phase: 'ready', replacing: false }
        : { error: event.error, phase: 'error', replacing: false };
    case 'CANCELLED':
      return { asset: state.asset, phase: state.asset ? 'ready' : 'idle', replacing: false };
    case 'CLEAR':
      return ['idle', 'ready', 'error'].includes(state.phase) ? { phase: 'idle', replacing: false } : state;
    default:
      return state;
  }
}
