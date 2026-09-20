import { useEffect, useState, useSyncExternalStore } from 'react';

export type BrowserAudioStatus = {
  isLoaded: boolean;
  duration: number;
  currentTime: number;
  playing: boolean;
  didJustFinish: boolean;
  isBuffering: boolean;
  playbackState: 'loading' | 'readyToPlay' | 'error';
  timeControlStatus: 'playing' | 'paused' | 'waiting';
};

const initialStatus = (): BrowserAudioStatus => ({
  isLoaded: false, duration: 0, currentTime: 0, playing: false,
  didJustFinish: false, isBuffering: false, playbackState: 'loading', timeControlStatus: 'paused',
});

// Media transport only. The caller keeps its queue, resource resolver and the
// existing AudioSessionOrchestrator lease; there is no second session owner.
export class BrowserAudioPlayer {
  private media?: HTMLAudioElement;
  private status = initialStatus();
  private listeners = new Set<() => void>();
  private detach = () => {};
  private refresh = () => {};
  private generation = 0;

  constructor(private createMedia: () => HTMLAudioElement = () => new Audio()) {}

  get currentStatus() { return this.status; }
  get isLoaded() { return this.status.isLoaded; }
  getSnapshot = () => this.status;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  private publish(status: BrowserAudioStatus) {
    this.status = status;
    this.listeners.forEach(listener => listener());
  }

  replace(source: string | null) {
    const generation = ++this.generation;
    this.detach();
    this.refresh = () => {};
    this.media?.pause();
    this.publish(initialStatus());
    if (!source) {
      this.media?.removeAttribute('src');
      this.media?.load();
      return;
    }
    // Reuse the element, as the established Web study player does, so a user
    // gesture authorizes subsequent queue playback on the same element.
    const media = this.media ?? this.createMedia();
    this.media = media;
    media.crossOrigin = 'anonymous';
    media.preload = 'auto';
    media.src = source;
    const expectedSource = media.src;
    const refresh = () => {
      if (generation !== this.generation || (media.currentSrc || media.src) !== expectedSource) return;
      const playing = !media.paused && !media.ended;
      const buffering = playing && media.readyState < 3;
      this.publish({
        isLoaded: media.readyState >= 2 && !media.error,
        duration: Number.isFinite(media.duration) ? media.duration : 0,
        currentTime: Number.isFinite(media.currentTime) ? media.currentTime : 0,
        playing, didJustFinish: media.ended, isBuffering: buffering,
        playbackState: media.error ? 'error' : media.readyState >= 2 ? 'readyToPlay' : 'loading',
        timeControlStatus: buffering ? 'waiting' : playing ? 'playing' : 'paused',
      });
    };
    const events = ['loadedmetadata', 'loadeddata', 'canplay', 'playing', 'pause', 'timeupdate', 'seeked', 'waiting', 'stalled', 'ended', 'error'];
    events.forEach(event => media.addEventListener(event, refresh));
    this.detach = () => events.forEach(event => media.removeEventListener(event, refresh));
    this.refresh = refresh;
    media.load();
  }

  async play() {
    if (!this.media) throw new Error('audio_source_missing');
    await this.media.play();
    this.refresh();
  }

  pause() { this.media?.pause(); this.refresh(); }
  async seekTo(seconds: number) {
    if (this.media) this.media.currentTime = seconds;
    this.refresh();
  }
  setPlaybackRate(rate: number) { if (this.media) this.media.playbackRate = rate; }

  release() {
    this.generation += 1;
    this.detach();
    this.refresh = () => {};
    this.media?.pause();
    this.media?.removeAttribute('src');
    this.media?.load();
    this.media = undefined;
    this.status = initialStatus();
  }
}

export function useBrowserAudioPlayer() {
  const [player] = useState(() => new BrowserAudioPlayer());
  useSyncExternalStore(player.subscribe, player.getSnapshot, player.getSnapshot);
  useEffect(() => () => player.release(), [player]);
  return player;
}
