import {
  createNativeRadioIntervalTrack,
  getRadioNativeQueueBehavior,
  isNativeRadioContentTrack,
  isNativeRadioIntervalTrack,
  radioIntervalStartPosition,
  type NativeRadioContentTrack,
} from '../native-queue';

const source: NativeRadioContentTrack = {
  album: '听力 · 题组一',
  artist: '听你五个',
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
    [1, 29],
    [5, 25],
    [30, 0],
  ])('seeks a 30-second native silence track for a %s-second wait', (seconds, expectedPosition) => {
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
      duration: 30,
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
});
