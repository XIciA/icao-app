import { Asset } from 'expo-asset';

import {
  createNativeRadioIntervalTrack,
  selectNativeShuffleTrack,
  getRadioNativeQueueBehavior,
  getRadioArtwork,
  isNativeRadioContentTrack,
  isNativeRadioIntervalTrack,
  radioIntervalStartPosition,
  type NativeRadioContentTrack,
} from '../native-queue';

const source: NativeRadioContentTrack = {
  album: '听力 · 题组一',
  artist: '听你五个',
  artwork: 'file:///app/assets/icon-native.png',
  duration: 12,
  id: 'native-content-1',
  radioBankId: 'listening',
  radioTrackId: 'listening-main-001',
  radioTrackKind: 'content',
  title: 'Question 1',
  url: 'https://example.com/audio.mp3',
};

describe('radio native interval queue metadata', () => {
  it.each([
    [1, 0],
    [5, 0],
    [30, 0],
  ])('starts an exact-duration native silence track at zero for a %s-second wait', (seconds, expectedPosition) => {
    expect(radioIntervalStartPosition(seconds)).toBe(expectedPosition);
  });

  it.each([
    ['order', 0, 'next', false, false],
    ['shuffle', 0, 'next', false, false],
    ['repeatOne', 0, 'next', false, true],
    ['order', 1, 'next', true, false],
    ['shuffle', 5, 'next', true, false],
    ['repeatOne', 1, 'current', true, false],
    ['repeatOne', 5, 'current', true, false],
    ['repeatOne', 30, 'current', true, false],
  ] as const)('plans %s mode at %ss without changing the zero-second legacy path', (mode, seconds, target, includesInterval, repeatsCurrentNatively) => {
    expect(getRadioNativeQueueBehavior(mode, seconds)).toEqual({
      automaticTarget: target,
      includesInterval,
      repeatsCurrentNatively,
    });
  });

  it('keeps source lock-screen metadata while identifying the interval separately', () => {
    const interval = createNativeRadioIntervalTrack(source, 5, 2);

    expect(interval).toEqual(expect.objectContaining({
      album: source.album,
      artist: source.artist,
      artwork: source.artwork,
      duration: 5,
      radioBankId: source.radioBankId,
      radioIntervalSeconds: 5,
      radioSourceTrackId: source.radioTrackId,
      radioTrackKind: 'interval',
      title: source.title,
    }));
    expect(isNativeRadioIntervalTrack(interval)).toBe(true);
    expect(isNativeRadioContentTrack(source)).toBe(true);
    expect(interval.id).not.toBe(source.id);
  });
  it('preserves native random forward history after stepping back', () => {
    expect(selectNativeShuffleTrack({ history: ['a', 'b', 'c'], cursor: 0 }, 'b'))
      .toEqual({ history: ['a', 'b', 'c'], cursor: 1 });
  });

});

describe('bundled radio artwork', () => {
  afterEach(() => jest.restoreAllMocks());

  it('resolves the full square source from the asset registry and prefers its local URI', () => {
    const resolve = jest.spyOn(Asset, 'fromModule').mockReturnValue({
      localUri: 'file:///app/assets/icon-native.png', uri: 'asset:/icon-native.png',
    } as Asset);
    expect(getRadioArtwork()).toBe('file:///app/assets/icon-native.png');
    expect(resolve).toHaveBeenCalledWith(require('../../../../assets/images/icon-native.png'));
  });

  it('uses the bundled URI when the asset has no separate cached file', () => {
    jest.spyOn(Asset, 'fromModule').mockReturnValue({ localUri: null, uri: 'file:///app/assets/icon-native.png' } as Asset);
    expect(getRadioArtwork()).toBe('file:///app/assets/icon-native.png');
  });

  it('does not turn an artwork resolution failure into an audio failure', () => {
    jest.spyOn(Asset, 'fromModule').mockImplementation(() => { throw new Error('missing_asset'); });
    const warning = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(getRadioArtwork()).toBeUndefined();
    expect(warning).toHaveBeenCalledWith('[radio] Bundled artwork could not be resolved');
  });
});
