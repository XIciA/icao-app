import { BrowserAudioPlayer } from '../browser-audio-player';

function mediaFixture() {
  const handlers = new Map<string, Set<() => void>>();
  const media = {
    src: '', currentSrc: '', crossOrigin: '', preload: '', duration: Number.NaN,
    currentTime: 0, readyState: 0, paused: true, ended: false, error: null as null | object, playbackRate: 1,
    addEventListener: (event: string, handler: () => void) => {
      if (!handlers.has(event)) handlers.set(event, new Set());
      handlers.get(event)!.add(handler);
    },
    removeEventListener: (event: string, handler: () => void) => { handlers.get(event)?.delete(handler); },
    load: jest.fn(() => { media.currentSrc = media.src; media.currentTime = 0; media.readyState = 0; media.ended = false; media.error = null; }),
    play: jest.fn(async () => { media.paused = false; media.ended = false; }),
    pause: jest.fn(() => { media.paused = true; }),
    removeAttribute: jest.fn(() => { media.src = ''; }),
  };
  return { media, handlers, emit: (event: string) => { handlers.get(event)?.forEach(handler => handler()); } };
}

it('reports ended even when the browser emits no final timeupdate, and resets it on replacement', async () => {
  const { media, emit } = mediaFixture();
  const factory = jest.fn(() => media as unknown as HTMLAudioElement);
  const player = new BrowserAudioPlayer(factory);
  const changed = jest.fn(); player.subscribe(changed);
  player.replace('https://example.test/first.mp3');
  expect(player.isLoaded).toBe(false);
  media.readyState = 4; media.duration = 13; emit('loadeddata');
  await player.play();
  expect(player.currentStatus.playing).toBe(true);
  media.currentTime = 12.9; emit('timeupdate');
  media.currentTime = 13; media.ended = true; media.paused = true;
  emit('ended');
  expect(player.currentStatus).toMatchObject({ currentTime: 13, didJustFinish: true, playing: false });
  expect(changed).toHaveBeenCalled();
  player.replace('https://example.test/second.mp3');
  expect(player.currentStatus).toMatchObject({ currentTime: 0, didJustFinish: false, isLoaded: false });
  expect(factory).toHaveBeenCalledTimes(1);
  player.release();
});

it('ignores late callbacks from the previous source, including loading and failure events', () => {
  const { media, handlers, emit } = mediaFixture();
  const player = new BrowserAudioPlayer(() => media as unknown as HTMLAudioElement);
  player.replace('https://example.test/first.mp3');
  const previousHandler = [...handlers.get('ended')!][0];
  player.replace('https://example.test/second.mp3');
  media.currentSrc = 'https://example.test/first.mp3';
  media.readyState = 4; media.ended = true;
  previousHandler(); emit('loadeddata'); emit('ended');
  expect(player.currentStatus).toMatchObject({ isLoaded: false, didJustFinish: false });
  media.currentSrc = media.src; media.ended = false; emit('loadeddata');
  expect(player.isLoaded).toBe(true);
  media.error = {}; emit('error');
  expect(player.currentStatus.playbackState).toBe('error');
  player.release();
  media.ended = true; previousHandler(); emit('ended');
  expect(player.currentStatus.didJustFinish).toBe(false);
});

it('propagates play rejection for a visible retry and reports pause, seek, and buffering', async () => {
  const { media, emit } = mediaFixture();
  const player = new BrowserAudioPlayer(() => media as unknown as HTMLAudioElement);
  player.replace('https://example.test/first.mp3');
  media.readyState = 4; media.duration = 20; emit('loadeddata');
  media.play.mockRejectedValueOnce(new Error('NotAllowedError'));
  await expect(player.play()).rejects.toThrow('NotAllowedError');
  await player.play();
  await player.seekTo(5); player.setPlaybackRate(1.25);
  expect(player.currentStatus.currentTime).toBe(5);
  expect(media.playbackRate).toBe(1.25);
  media.readyState = 2; emit('waiting');
  expect(player.currentStatus.isBuffering).toBe(true);
  player.pause();
  expect(player.currentStatus.playing).toBe(false);
  player.replace(null);
  expect(player.isLoaded).toBe(false);
  expect(media.src).toBe('');
  player.release();
});
