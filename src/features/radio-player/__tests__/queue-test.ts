import { getEmbeddedRadioCatalogs } from '../catalog';
import { nextManualTrack, nextTrack, previousTrack, selectShuffleTrack } from '../queue';
import type { RadioTrack } from '../types';

const tracks = ['a', 'b', 'c'].map((id, stableIndex) => ({ id, stableIndex })) as RadioTrack[];

describe('radio player queue', () => {
  test('order playback wraps in both directions', () => {
    const shuffle = { history: ['c'], cursor: 0 };
    expect(nextTrack(tracks, 'c', 'order', shuffle).trackId).toBe('a');
    expect(previousTrack(tracks, 'a', 'order', shuffle).trackId).toBe('c');
  });

  test('repeat one keeps the current track', () => {
    expect(nextTrack(tracks, 'b', 'repeatOne', { history: ['b'], cursor: 0 }).trackId).toBe('b');
  });

  test('manual next still advances while repeat-one controls automatic completion', () => {
    expect(nextManualTrack(tracks, 'b', 'repeatOne', { history: ['b'], cursor: 0 }).trackId).toBe('c');
  });

  test('shuffle avoids an immediate repeat and can return through history', () => {
    const initial = selectShuffleTrack({ history: [], cursor: -1 }, 'a');
    const next = nextTrack(tracks, 'a', 'shuffle', initial, () => 0);
    expect(next.trackId).toBe('b');
    const back = previousTrack(tracks, 'b', 'shuffle', next.shuffle);
    expect(back.trackId).toBe('a');
    expect(nextTrack(tracks, 'a', 'shuffle', back.shuffle, () => 0).trackId).toBe('b');
  });

  test('embedded shared contract exposes every eligible track with duration', () => {
    const catalogs = getEmbeddedRadioCatalogs();
    expect(catalogs.map((catalog) => [catalog.bankId, catalog.tracks.length])).toEqual([
      ['listening', 40],
      ['sentences900', 900],
      ['radiotelephony', 18],
      ['storytelling', 3],
      ['opi', 23],
    ]);
    expect(catalogs.flatMap((catalog) => catalog.tracks).every((track) => track.durationSeconds > 0)).toBe(true);
  });
});
