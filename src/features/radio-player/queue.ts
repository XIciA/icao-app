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
  if (!tracks.length) return { trackId: undefined, shuffle };
  if (mode === 'repeatOne') return { trackId: currentId, shuffle };
  const currentIndex = Math.max(0, tracks.findIndex((track) => track.id === currentId));
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
  if (!tracks.length) return { trackId: undefined, shuffle };
  if (mode === 'shuffle' && shuffle.cursor > 0) {
    const cursor = shuffle.cursor - 1;
    return { trackId: shuffle.history[cursor], shuffle: { ...shuffle, cursor } };
  }
  const currentIndex = Math.max(0, tracks.findIndex((track) => track.id === currentId));
  const trackId = tracks[(currentIndex - 1 + tracks.length) % tracks.length].id;
  return { trackId, shuffle: mode === 'shuffle' ? selectShuffleTrack(shuffle, trackId) : shuffle };
}
