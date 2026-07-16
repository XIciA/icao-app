import Storage from 'expo-sqlite/kv-store';
import TrackPlayer, {
  Event,
  RepeatMode,
  State,
  usePlaybackState,
  useProgress,
  useTrackPlayerEvents,
} from 'react-native-track-player';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react';
import { AppState } from 'react-native';

import { resolveQuestionBankAsset, resolveRemoteQuestionBankAsset } from '@/features/question-bank/platform/resource-service';
import { claimAudioSession, registerAudioOwner, releaseAudioSession } from '@/platform/audio-session-coordinator';

import { getEmbeddedRadioCatalogs, loadRadioCatalogs } from './catalog';
import { nextManualTrack, nextTrack, previousTrack, selectShuffleTrack, type ShuffleState } from './queue';
import { ensureRadioTrackPlayer, setRadioRemoteHandlers } from './track-player-runtime';
import type { RadioBankId, RadioCatalog, RadioPlaybackMode, RadioSubtitleMode, RadioTrack } from './types';

const STORAGE_KEY = 'icao.radio-player.v1';
const speedOptions = [0.75, 1, 1.25, 1.5] as const;
const radioPlayerEvents: [
  Event.PlaybackActiveTrackChanged,
  Event.PlaybackError,
  Event.PlaybackQueueEnded,
] = [Event.PlaybackActiveTrackChanged, Event.PlaybackError, Event.PlaybackQueueEnded];

type Snapshot = {
  schemaVersion: 1;
  bankId: RadioBankId;
  trackId: string;
  position: number;
  mode: RadioPlaybackMode;
  subtitleMode: RadioSubtitleMode;
  rate: number;
  bankTrackIds: Partial<Record<RadioBankId, string>>;
};

type RadioContextValue = {
  catalogs: RadioCatalog[];
  currentCatalog?: RadioCatalog;
  currentTrack?: RadioTrack;
  currentIndex: number;
  mode: RadioPlaybackMode;
  subtitleMode: RadioSubtitleMode;
  rate: number;
  speedOptions: readonly number[];
  playing: boolean;
  loading: boolean;
  buffering: boolean;
  error?: string;
  position: number;
  duration: number;
  sessionVisible: boolean;
  activateSession: () => void;
  play: () => Promise<void>;
  pause: () => void;
  toggle: () => Promise<void>;
  seek: (position: number) => Promise<void>;
  next: (autoPlay?: boolean) => Promise<void>;
  previous: () => Promise<void>;
  selectBank: (bankId: RadioBankId) => void;
  selectTrack: (trackId: string, autoPlay?: boolean) => void;
  setMode: (mode: RadioPlaybackMode) => void;
  setSubtitleMode: (mode: RadioSubtitleMode) => void;
  setRate: (rate: number) => void;
  retry: () => void;
  stopAndClear: () => void;
};

type NativeRadioTrack = {
  id: string;
  url: string;
  title: string;
  artist: string;
  album: string;
  duration: number;
  radioTrackId: string;
  radioBankId: RadioBankId;
};

const RadioContext = createContext<RadioContextValue | undefined>(undefined);

function findTrack(catalogs: RadioCatalog[], bankId: RadioBankId, trackId: string) {
  const catalog = catalogs.find((item) => item.bankId === bankId) ?? catalogs[0];
  const track = catalog?.tracks.find((item) => item.id === trackId) ?? catalog?.tracks[0];
  return { catalog, track };
}

export function RadioPlayerProvider({ children }: PropsWithChildren) {
  const [playerReady, setPlayerReady] = useState(false);

  useEffect(() => {
    let active = true;
    void ensureRadioTrackPlayer().then(() => {
      if (active) setPlayerReady(true);
    }).catch(() => {
      // A radio player is a root dependency. Keep descendants unmounted so
      // Track Player hooks never query an uninitialized native instance.
    });
    return () => { active = false; };
  }, []);

  if (!playerReady) return null;
  return <ReadyRadioPlayerProvider>{children}</ReadyRadioPlayerProvider>;
}

function ReadyRadioPlayerProvider({ children }: PropsWithChildren) {
  const embeddedCatalogs = useMemo(getEmbeddedRadioCatalogs, []);
  const [catalogs, setCatalogs] = useState(embeddedCatalogs);
  const [bankId, setBankId] = useState<RadioBankId>(embeddedCatalogs[0]?.bankId ?? 'listening');
  const [trackId, setTrackId] = useState(embeddedCatalogs[0]?.tracks[0]?.id ?? '');
  const [bankTrackIds, setBankTrackIds] = useState<Partial<Record<RadioBankId, string>>>({});
  const [mode, setModeState] = useState<RadioPlaybackMode>('order');
  const [subtitleMode, setSubtitleModeState] = useState<RadioSubtitleMode>('bilingual');
  const [rate, setRateState] = useState(1);
  const [sourceState, setSourceState] = useState<{ loading: boolean; error?: string }>({ loading: false });
  const [sessionVisible, setSessionVisible] = useState(false);
  const [restored, setRestored] = useState(false);
  const [shuffle, setShuffle] = useState<ShuffleState>({ history: trackId ? [trackId] : [], cursor: trackId ? 0 : -1 });
  const playback = usePlaybackState();
  const progress = useProgress(250);
  const generation = useRef(0);
  const preparedTrackId = useRef<string | undefined>(undefined);
  const requestedTrackId = useRef<string | undefined>(undefined);
  const queuedNextTrackId = useRef<string | undefined>(undefined);
  const pendingPlay = useRef(false);
  const pendingSeek = useRef(0);
  const nativeTransitionTrackId = useRef<string | undefined>(undefined);
  const stateRef = useRef({ bankId, trackId, bankTrackIds, catalogs, mode, subtitleMode, rate, position: 0, shuffle });

  const { catalog: currentCatalog, track: currentTrack } = findTrack(catalogs, bankId, trackId);
  const currentIndex = currentTrack ? currentCatalog?.tracks.findIndex((track) => track.id === currentTrack.id) ?? -1 : -1;
  const duration = progress.duration || currentTrack?.durationSeconds || 0;
  const playing = playback.state === State.Playing;
  const buffering = playback.state === State.Buffering || playback.state === State.Loading;
  stateRef.current = {
    bankId: currentCatalog?.bankId ?? bankId,
    trackId: currentTrack?.id ?? trackId,
    bankTrackIds,
    catalogs,
    mode,
    subtitleMode,
    rate,
    position: progress.position,
    shuffle,
  };

  const saveSnapshot = useCallback(() => {
    const current = stateRef.current;
    if (!current.trackId) return Promise.resolve();
    return Storage.setItem(STORAGE_KEY, JSON.stringify({
      schemaVersion: 1,
      bankId: current.bankId,
      trackId: current.trackId,
      position: current.position,
      mode: current.mode,
      subtitleMode: current.subtitleMode,
      rate: current.rate,
      bankTrackIds: current.bankTrackIds,
    } satisfies Snapshot));
  }, []);

  const resolveTrack = useCallback(async (track: RadioTrack, forceRefresh = false): Promise<NativeRadioTrack> => {
    const local = resolveQuestionBankAsset(track.audioPath);
    const remote = await resolveRemoteQuestionBankAsset(track.audioPath, { forceRefresh }).catch(() => undefined);
    const uri = remote ?? local;
    if (!uri) throw new Error('resource_unavailable');
    return {
      id: `radio:${track.bankId}:${track.id}:${generation.current}`,
      url: uri,
      title: track.title,
      artist: '飞猪 ICAO',
      album: `${track.bankTitle} · ${track.topicTitle}`,
      duration: track.durationSeconds,
      radioTrackId: track.id,
      radioBankId: track.bankId,
    };
  }, []);

  const chooseUpcoming = useCallback((catalog: RadioCatalog, track: RadioTrack, currentMode: RadioPlaybackMode, currentShuffle: ShuffleState) => {
    if (currentMode === 'shuffle') {
      const candidates = catalog.tracks.filter((item) => item.id !== track.id);
      return candidates[Math.floor(Math.random() * candidates.length)] ?? track;
    }
    const result = nextTrack(catalog.tracks, track.id, 'order', currentShuffle);
    return catalog.tracks.find((item) => item.id === result.trackId);
  }, []);

  const appendUpcoming = useCallback(async (catalog: RadioCatalog, track: RadioTrack, forceRefresh = false) => {
    const currentMode = stateRef.current.mode;
    if (currentMode === 'repeatOne' && queuedNextTrackId.current) return;
    const upcoming = chooseUpcoming(catalog, track, currentMode, stateRef.current.shuffle);
    if (!upcoming || upcoming.id === queuedNextTrackId.current) return;
    const queue = await TrackPlayer.getQueue();
    if (queue.some((item) => item.radioTrackId === upcoming.id)) {
      queuedNextTrackId.current = upcoming.id;
      return;
    }
    const nativeTrack = await resolveTrack(upcoming, forceRefresh);
    await TrackPlayer.add(nativeTrack);
    queuedNextTrackId.current = upcoming.id;
  }, [chooseUpcoming, resolveTrack]);

  const prepareTrack = useCallback(async (
    catalog: RadioCatalog,
    track: RadioTrack,
    { autoPlay, forceRefresh = false, position = 0 }: { autoPlay: boolean; forceRefresh?: boolean; position?: number },
  ) => {
    const request = generation.current + 1;
    generation.current = request;
    pendingPlay.current = autoPlay;
    pendingSeek.current = Math.max(0, position);
    preparedTrackId.current = undefined;
    queuedNextTrackId.current = undefined;
    setSourceState({ loading: true });
    try {
      const currentMode = stateRef.current.mode;
      const currentRate = stateRef.current.rate;
      await ensureRadioTrackPlayer();
      await TrackPlayer.pause();
      const nativeTrack = await resolveTrack(track, forceRefresh);
      if (request !== generation.current) return;
      const upcoming = chooseUpcoming(catalog, track, currentMode, stateRef.current.shuffle);
      const nativeUpcoming = upcoming ? await resolveTrack(upcoming, forceRefresh).catch(() => undefined) : undefined;
      if (request !== generation.current) return;
      await TrackPlayer.reset();
      await TrackPlayer.add(nativeUpcoming ? [nativeTrack, nativeUpcoming] : [nativeTrack]);
      queuedNextTrackId.current = nativeUpcoming && upcoming ? upcoming.id : undefined;
      await TrackPlayer.setRepeatMode(currentMode === 'repeatOne' ? RepeatMode.Track : RepeatMode.Off);
      await TrackPlayer.setRate(currentRate);
      const seek = Math.min(Math.max(0, pendingSeek.current), Math.max(0, track.durationSeconds - 0.25));
      if (seek > 0) await TrackPlayer.seekTo(seek);
      preparedTrackId.current = track.id;
      pendingSeek.current = 0;
      setSourceState({ loading: false });
      if (pendingPlay.current) {
        await claimAudioSession('radio');
        await TrackPlayer.play();
      }
    } catch {
      if (request !== generation.current) return;
      pendingPlay.current = false;
      setSourceState({ loading: false, error: '音频加载失败，请重试或切换下一首' });
    }
  }, [chooseUpcoming, resolveTrack]);

  useEffect(() => {
    void loadRadioCatalogs().then((next) => {
      if (next.length) setCatalogs(next);
    }).catch(() => undefined);
  }, []);

  useEffect(() => {
    let active = true;
    void Storage.getItem(STORAGE_KEY).then((raw) => {
      if (!active || !raw) return;
      try {
        const value = JSON.parse(raw) as Snapshot;
        if (value.schemaVersion !== 1) return;
        const { catalog, track } = findTrack(embeddedCatalogs, value.bankId, value.trackId);
        if (!catalog || !track) return;
        setBankId(catalog.bankId);
        setTrackId(track.id);
        setBankTrackIds(value.bankTrackIds ?? {});
        setModeState(['order', 'repeatOne', 'shuffle'].includes(value.mode) ? value.mode : 'order');
        setSubtitleModeState(['english', 'bilingual', 'off'].includes(value.subtitleMode) ? value.subtitleMode : 'bilingual');
        setRateState(speedOptions.includes(value.rate as (typeof speedOptions)[number]) ? value.rate : 1);
        pendingSeek.current = Math.max(0, value.position || 0);
        setShuffle({ history: [track.id], cursor: 0 });
      } catch {
        // Invalid local state safely falls back to the first available track.
      }
    }).finally(() => { if (active) setRestored(true); });
    return () => { active = false; };
  }, [embeddedCatalogs]);

  useEffect(() => registerAudioOwner('radio', () => {
    pendingPlay.current = false;
    void TrackPlayer.pause();
  }), []);

  useEffect(() => {
    if (!restored || !currentCatalog || !currentTrack) return;
    if (nativeTransitionTrackId.current === currentTrack.id || requestedTrackId.current === currentTrack.id) {
      nativeTransitionTrackId.current = undefined;
      requestedTrackId.current = undefined;
      return;
    }
    const restorePosition = preparedTrackId.current ? 0 : pendingSeek.current;
    void prepareTrack(currentCatalog, currentTrack, { autoPlay: pendingPlay.current, position: restorePosition });
  }, [currentCatalog, currentTrack, prepareTrack, restored]);

  useTrackPlayerEvents(radioPlayerEvents, (event) => {
    if (event.type === Event.PlaybackError) {
      pendingPlay.current = false;
      setSourceState({ loading: false, error: '音频播放失败，请重试或切换下一首' });
      return;
    }
    if (event.type === Event.PlaybackQueueEnded) {
      pendingPlay.current = false;
      setSourceState({ loading: false, error: '下一首音频暂时无法加载，请重试或手动切换' });
      return;
    }
    const native = event.track as NativeRadioTrack | undefined;
    if (!native?.radioTrackId || native.radioTrackId === stateRef.current.trackId) return;
    const { catalog, track } = findTrack(stateRef.current.catalogs, native.radioBankId, native.radioTrackId);
    if (!catalog || !track) return;
    nativeTransitionTrackId.current = track.id;
    preparedTrackId.current = track.id;
    queuedNextTrackId.current = undefined;
    pendingPlay.current = true;
    setBankId(catalog.bankId);
    setTrackId(track.id);
    setBankTrackIds((current) => ({ ...current, [catalog.bankId]: track.id }));
    setShuffle((current) => selectShuffleTrack(current, track.id));
    setSourceState({ loading: false });
    void appendUpcoming(catalog, track).catch(() => undefined);
  });

  const play = useCallback(async () => {
    if (!currentCatalog || !currentTrack) return;
    setSessionVisible(true);
    pendingPlay.current = true;
    if (preparedTrackId.current !== currentTrack.id) {
      await prepareTrack(currentCatalog, currentTrack, { autoPlay: true, position: progress.position });
      return;
    }
    await claimAudioSession('radio');
    if (playback.state === State.Ended || progress.position >= duration - 0.1) await TrackPlayer.seekTo(0);
    await TrackPlayer.play();
  }, [currentCatalog, currentTrack, duration, playback.state, prepareTrack, progress.position]);

  const pause = useCallback(() => {
    pendingPlay.current = false;
    void TrackPlayer.pause();
    void saveSnapshot();
  }, [saveSnapshot]);

  const chooseTrack = useCallback((nextTrackId: string, autoPlay = true) => {
    const current = stateRef.current;
    const { catalog, track } = findTrack(current.catalogs, current.bankId, nextTrackId);
    if (!catalog || !track) return;
    pendingPlay.current = autoPlay;
    requestedTrackId.current = track.id;
    setTrackId(track.id);
    setBankTrackIds((value) => ({ ...value, [catalog.bankId]: track.id }));
    setShuffle((value) => selectShuffleTrack(value, track.id));
    if (autoPlay) setSessionVisible(true);
    void prepareTrack(catalog, track, { autoPlay });
  }, [prepareTrack]);

  const next = useCallback(async (autoPlay = true) => {
    const current = stateRef.current;
    const { catalog, track } = findTrack(current.catalogs, current.bankId, current.trackId);
    if (!catalog || !track) return;
    const result = nextManualTrack(catalog.tracks, track.id, current.mode, current.shuffle);
    if (!result.trackId) return;
    if (queuedNextTrackId.current === result.trackId) {
      pendingPlay.current = autoPlay;
      setShuffle(result.shuffle);
      await TrackPlayer.skipToNext(0);
      if (autoPlay) await TrackPlayer.play();
      return;
    }
    chooseTrack(result.trackId, autoPlay);
  }, [chooseTrack]);

  const previous = useCallback(async () => {
    const current = stateRef.current;
    const { catalog, track } = findTrack(current.catalogs, current.bankId, current.trackId);
    if (!catalog || !track) return;
    const result = previousTrack(catalog.tracks, track.id, current.mode, current.shuffle);
    if (!result.trackId) return;
    setShuffle(result.shuffle);
    chooseTrack(result.trackId, true);
  }, [chooseTrack]);

  const seek = useCallback(async (position: number) => {
    await TrackPlayer.seekTo(Math.max(0, Math.min(duration, position)));
  }, [duration]);

  const stopAndClear = useCallback(() => {
    generation.current += 1;
    pendingPlay.current = false;
    preparedTrackId.current = undefined;
    queuedNextTrackId.current = undefined;
    void TrackPlayer.reset();
    releaseAudioSession('radio');
    setSessionVisible(false);
  }, []);

  useEffect(() => {
    setRadioRemoteHandlers({ next: () => next(true), pause, play, previous, seek, stop: stopAndClear });
    return () => setRadioRemoteHandlers(undefined);
  }, [next, pause, play, previous, seek, stopAndClear]);

  useEffect(() => {
    const interval = setInterval(() => { if (sessionVisible) void saveSnapshot(); }, 2_000);
    const subscription = AppState.addEventListener('change', (state) => { if (state !== 'active') void saveSnapshot(); });
    return () => { clearInterval(interval); subscription.remove(); };
  }, [saveSnapshot, sessionVisible]);

  const setMode = useCallback((nextMode: RadioPlaybackMode) => {
    stateRef.current.mode = nextMode;
    setModeState(nextMode);
    const current = stateRef.current;
    const { catalog, track } = findTrack(current.catalogs, current.bankId, current.trackId);
    if (!catalog || !track) return;
    const shouldPlay = playback.state === State.Playing;
    void prepareTrack(catalog, track, { autoPlay: shouldPlay, position: progress.position });
  }, [playback.state, prepareTrack, progress.position]);

  const value = useMemo<RadioContextValue>(() => ({
    catalogs,
    currentCatalog,
    currentTrack,
    currentIndex,
    mode,
    subtitleMode,
    rate,
    speedOptions,
    playing,
    loading: sourceState.loading,
    buffering,
    error: sourceState.error,
    position: progress.position,
    duration,
    sessionVisible,
    activateSession: () => setSessionVisible(true),
    play,
    pause,
    toggle: async () => { if (playing) pause(); else await play(); },
    seek,
    next,
    previous,
    selectBank: (nextBankId) => {
      const catalog = catalogs.find((item) => item.bankId === nextBankId);
      const nextId = bankTrackIds[nextBankId] && catalog?.tracks.some((track) => track.id === bankTrackIds[nextBankId])
        ? bankTrackIds[nextBankId]!
        : catalog?.tracks[0]?.id;
      if (!catalog || !nextId) return;
      pendingPlay.current = false;
      requestedTrackId.current = nextId;
      setBankId(nextBankId);
      setTrackId(nextId);
      setShuffle({ history: [nextId], cursor: 0 });
      const track = catalog.tracks.find((item) => item.id === nextId);
      if (track) void prepareTrack(catalog, track, { autoPlay: false });
    },
    selectTrack: chooseTrack,
    setMode,
    setSubtitleMode: setSubtitleModeState,
    setRate: (nextRate) => { stateRef.current.rate = nextRate; setRateState(nextRate); void TrackPlayer.setRate(nextRate); },
    retry: () => {
      if (currentCatalog && currentTrack) void prepareTrack(currentCatalog, currentTrack, { autoPlay: true, forceRefresh: true, position: progress.position });
    },
    stopAndClear,
  }), [bankTrackIds, buffering, catalogs, chooseTrack, currentCatalog, currentIndex, currentTrack, duration, mode, next, pause, play, playing, prepareTrack, previous, progress.position, rate, seek, sessionVisible, setMode, sourceState.error, sourceState.loading, stopAndClear, subtitleMode]);

  return <RadioContext.Provider value={value}>{children}</RadioContext.Provider>;
}

export function useRadioPlayer() {
  const value = useContext(RadioContext);
  if (!value) throw new Error('useRadioPlayer must be used inside RadioPlayerProvider');
  return value;
}
