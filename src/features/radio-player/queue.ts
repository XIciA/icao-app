import { canPlayRadioTrack } from './access';
import type { RadioPlaybackMode, RadioTrack } from './types';

export type ShuffleState = { history: string[]; cursor: number };

export function selectShuffleTrack(state: ShuffleState, trackId: string): ShuffleState {
  if (state.history[state.cursor] === trackId) return state;
  const history = [...state.history.slice(0, state.cursor + 1), trackId];
  return { history, cursor: history.length - 1 };
}

export function nextTrack(
  tracks: RadioTrack[],
  currentId: string,
  mode: RadioPlaybackMode,
  shuffle: ShuffleState,
  random = Math.random,
) {
  tracks = tracks.filter(canPlayRadioTrack);
  const allowed = new Set(tracks.map(track => track.id));
  const before = shuffle.history.slice(0, shuffle.cursor + 1).filter(id => allowed.has(id));
  shuffle = { history: [...before, ...shuffle.history.slice(shuffle.cursor + 1).filter(id => allowed.has(id))], cursor: before.length - 1 };
  if (!tracks.length) return { trackId: undefined, shuffle };
  if (mode === 'repeatOne' && allowed.has(currentId)) return { trackId: currentId, shuffle };
  const currentIndex = tracks.findIndex((track) => track.id === currentId);
  if (mode === 'order') return { trackId: tracks[(currentIndex + 1) % tracks.length].id, shuffle };
  if (shuffle.cursor < shuffle.history.length - 1) {
    const cursor = shuffle.cursor + 1;
    return { trackId: shuffle.history[cursor], shuffle: { ...shuffle, cursor } };
  }
  if (tracks.length === 1) return { trackId: tracks[0].id, shuffle: selectShuffleTrack(shuffle, tracks[0].id) };
  const candidates = tracks.filter((track) => track.id !== currentId);
  const chosen = candidates[Math.min(candidates.length - 1, Math.floor(random() * candidates.length))];
  const nextShuffle = selectShuffleTrack(shuffle, chosen.id);
  return { trackId: chosen.id, shuffle: nextShuffle };
}

export function nextManualTrack(
  tracks: RadioTrack[],
  currentId: string,
  mode: RadioPlaybackMode,
  shuffle: ShuffleState,
  random = Math.random,
) {
  return nextTrack(tracks, currentId, mode === 'repeatOne' ? 'order' : mode, shuffle, random);
}

export function previousTrack(tracks: RadioTrack[], currentId: string, mode: RadioPlaybackMode, shuffle: ShuffleState) {
  tracks = tracks.filter(canPlayRadioTrack);
  const allowed = new Set(tracks.map(track => track.id));
  const before = shuffle.history.slice(0, shuffle.cursor + 1).filter(id => allowed.has(id));
  shuffle = { history: [...before, ...shuffle.history.slice(shuffle.cursor + 1).filter(id => allowed.has(id))], cursor: before.length - 1 };
  if (!tracks.length) return { trackId: undefined, shuffle };
  if (mode === 'shuffle' && shuffle.cursor > 0) {
    const cursor = shuffle.cursor - 1;
    return { trackId: shuffle.history[cursor], shuffle: { ...shuffle, cursor } };
  }
  const currentIndex = tracks.findIndex((track) => track.id === currentId);
  const trackId = tracks[(Math.max(0, currentIndex) - 1 + tracks.length) % tracks.length].id;
  return { trackId, shuffle: mode === 'shuffle' ? selectShuffleTrack(shuffle, trackId) : shuffle };
}
