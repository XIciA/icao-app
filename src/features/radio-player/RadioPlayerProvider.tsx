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
import { audioSessionOrchestrator, type AudioLease } from '@/platform/audio';

import { getEmbeddedRadioCatalogs, loadRadioCatalogs } from './catalog';
import {
  clampRadioInterval,
  createNativeRadioIntervalTrack,
  ensureRadioIntervalSilenceAsset,
  getRadioNativeQueueBehavior,
  isNativeRadioContentTrack,
  isNativeRadioIntervalTrack,
  RADIO_INTERVAL_SILENCE_DURATION_SECONDS,
  radioIntervalStartPosition,
  type NativeRadioContentTrack,
} from './native-queue';
import { nextManualTrack, nextTrack, previousTrack, selectShuffleTrack, type ShuffleState } from './queue';
import { migrateRadioIntervalSeconds } from './radio-snapshot';
import { ensureRadioTrackPlayer, setRadioContentPlaybackRate, setRadioRemoteHandlers } from './track-player-runtime';
import type { RadioBankId, RadioCatalog, RadioPlaybackMode, RadioSubtitleMode, RadioTrack } from './types';

const STORAGE_KEY = 'icao.radio-player.v1';
const speedOptions = [0.75, 1, 1.25, 1.5] as const;
const radioPlayerEvents: [
  Event.PlaybackActiveTrackChanged,
  Event.PlaybackError,
  Event.PlaybackQueueEnded,
] = [Event.PlaybackActiveTrackChanged, Event.PlaybackError, Event.PlaybackQueueEnded];

type Snapshot = {
  schemaVersion: 1 | 2;
  bankId: RadioBankId;
  trackId: string;
  position: number;
  mode: RadioPlaybackMode;
  subtitleMode: RadioSubtitleMode;
  rate: number;
  intervalSeconds?: number;
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
  intervalSeconds: number;
  intervalRemaining: number;
  waitingForNext: boolean;
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
  setIntervalSeconds: (seconds: number) => void;
  retry: () => void;
  stopAndClear: () => void;
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
  const [subtitleMode, setSubtitleModeState] = useState<RadioSubtitleMode>('off');
  const [rate, setRateState] = useState(1);
  const [intervalSeconds, setIntervalSecondsState] = useState(0);
  const [waitingForNext, setWaitingForNextState] = useState(false);
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
  const nativeTrackInstance = useRef(0);
  const activeNativeContentTrack = useRef<NativeRadioContentTrack | undefined>(undefined);
  const waitingForNextRef = useRef(false);
  const audioLease = useRef<AudioLease | undefined>(undefined);
  const stateRef = useRef({ bankId, trackId, bankTrackIds, catalogs, intervalSeconds, mode, subtitleMode, rate, position: 0, shuffle });

  const { catalog: currentCatalog, track: currentTrack } = findTrack(catalogs, bankId, trackId);
  const currentIndex = currentTrack ? currentCatalog?.tracks.findIndex((track) => track.id === currentTrack.id) ?? -1 : -1;
  const contentDuration = currentTrack?.durationSeconds || 0;
  const duration = waitingForNext ? contentDuration : progress.duration || contentDuration;
  const position = waitingForNext ? contentDuration : progress.position;
  const intervalProgressPosition = waitingForNext && Math.abs(progress.duration - RADIO_INTERVAL_SILENCE_DURATION_SECONDS) < 0.1
    ? progress.position
    : radioIntervalStartPosition(intervalSeconds);
  const intervalRemaining = waitingForNext
    ? Math.min(intervalSeconds, Math.max(0, Math.ceil(RADIO_INTERVAL_SILENCE_DURATION_SECONDS - intervalProgressPosition)))
    : 0;
  const playing = playback.state === State.Playing;
  const buffering = playback.state === State.Buffering || playback.state === State.Loading;
  stateRef.current = {
    bankId: currentCatalog?.bankId ?? bankId,
    trackId: currentTrack?.id ?? trackId,
    bankTrackIds,
    catalogs,
    intervalSeconds,
    mode,
    subtitleMode,
    rate,
    position,
    shuffle,
  };

  const saveSnapshot = useCallback(() => {
    const current = stateRef.current;
    if (!current.trackId) return Promise.resolve();
    return Storage.setItem(STORAGE_KEY, JSON.stringify({
      schemaVersion: 2,
      bankId: current.bankId,
      trackId: current.trackId,
      position: current.position,
      mode: current.mode,
      subtitleMode: current.subtitleMode,
      rate: current.rate,
      intervalSeconds: current.intervalSeconds,
      bankTrackIds: current.bankTrackIds,
    } satisfies Snapshot));
  }, []);

  const releaseRadioLease = useCallback(async (lease = audioLease.current) => {
    if (lease) await audioSessionOrchestrator.release(lease).catch(() => undefined);
    if (audioLease.current?.token === lease?.token) audioLease.current = undefined;
  }, []);

  const setWaitingForNext = useCallback((waiting: boolean) => {
    waitingForNextRef.current = waiting;
    setWaitingForNextState(waiting);
  }, []);

  const resolveTrack = useCallback(async (track: RadioTrack, forceRefresh = false): Promise<NativeRadioContentTrack> => {
    const local = resolveQuestionBankAsset(track.audioPath);
    const remote = await resolveRemoteQuestionBankAsset(track.audioPath, { forceRefresh }).catch(() => undefined);
    const uri = remote ?? local;
    if (!uri) throw new Error('resource_unavailable');
    return {
      id: `radio:${track.bankId}:${track.id}:${generation.current}:${nativeTrackInstance.current += 1}`,
      url: uri,
      title: track.title,
      artist: '飞猪 ICAO',
      album: `${track.bankTitle} · ${track.topicTitle}`,
      duration: track.durationSeconds,
      radioTrackId: track.id,
      radioBankId: track.bankId,
      radioTrackKind: 'content',
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

  const appendUpcoming = useCallback(async (
    catalog: RadioCatalog,
    track: RadioTrack,
    forceRefresh = false,
    nativeSource?: NativeRadioContentTrack,
  ) => {
    const currentMode = stateRef.current.mode;
    const currentInterval = stateRef.current.intervalSeconds;
    const queueBehavior = getRadioNativeQueueBehavior(currentMode, currentInterval);
    if (queueBehavior.repeatsCurrentNatively && queuedNextTrackId.current) return;
    const upcoming = queueBehavior.automaticTarget === 'current'
      ? track
      : chooseUpcoming(catalog, track, currentMode, stateRef.current.shuffle);
    if (!upcoming || upcoming.id === queuedNextTrackId.current) return;
    const nativeUpcoming = await resolveTrack(upcoming, forceRefresh);
    if (queueBehavior.includesInterval) {
      await ensureRadioIntervalSilenceAsset().catch(() => undefined);
      const source = nativeSource ?? await resolveTrack(track, forceRefresh);
      await TrackPlayer.add([
        createNativeRadioIntervalTrack(source, currentInterval, nativeTrackInstance.current += 1),
        nativeUpcoming,
      ]);
    } else {
      await TrackPlayer.add(nativeUpcoming);
    }
    queuedNextTrackId.current = upcoming.id;
  }, [chooseUpcoming, resolveTrack]);

  const prepareTrack = useCallback(async (
    catalog: RadioCatalog,
    track: RadioTrack,
    { autoPlay, forceRefresh = false, position = 0 }: { autoPlay: boolean; forceRefresh?: boolean; position?: number },
  ) => {
    const request = generation.current + 1;
    let acquiredLease: AudioLease | undefined;
    generation.current = request;
    pendingPlay.current = autoPlay;
    pendingSeek.current = Math.max(0, position);
    preparedTrackId.current = undefined;
    queuedNextTrackId.current = undefined;
    setWaitingForNext(false);
    setSourceState({ loading: true });
    try {
      const currentMode = stateRef.current.mode;
      const currentRate = stateRef.current.rate;
      const currentInterval = stateRef.current.intervalSeconds;
      const queueBehavior = getRadioNativeQueueBehavior(currentMode, currentInterval);
      setRadioContentPlaybackRate(currentRate);
      await ensureRadioTrackPlayer();
      const previousLease = audioLease.current;
      await TrackPlayer.pause();
      await releaseRadioLease(previousLease);
      const nativeTrack = await resolveTrack(track, forceRefresh);
      if (request !== generation.current) return;
      const upcoming = queueBehavior.automaticTarget === 'current'
        ? track
        : chooseUpcoming(catalog, track, currentMode, stateRef.current.shuffle);
      const nativeUpcoming = upcoming ? await resolveTrack(upcoming, forceRefresh).catch(() => undefined) : undefined;
      if (request !== generation.current) return;
      if (queueBehavior.includesInterval) await ensureRadioIntervalSilenceAsset().catch(() => undefined);
      await TrackPlayer.reset();
      activeNativeContentTrack.current = nativeTrack;
      const queue = queueBehavior.includesInterval && nativeUpcoming
        ? [
          nativeTrack,
          createNativeRadioIntervalTrack(nativeTrack, currentInterval, nativeTrackInstance.current += 1),
          nativeUpcoming,
        ]
        : nativeUpcoming ? [nativeTrack, nativeUpcoming] : [nativeTrack];
      await TrackPlayer.add(queue);
      queuedNextTrackId.current = nativeUpcoming && upcoming ? upcoming.id : undefined;
      await TrackPlayer.setRepeatMode(queueBehavior.repeatsCurrentNatively ? RepeatMode.Track : RepeatMode.Off);
      await TrackPlayer.setRate(currentRate);
      const seek = Math.min(Math.max(0, pendingSeek.current), Math.max(0, track.durationSeconds - 0.25));
      if (seek > 0) await TrackPlayer.seekTo(seek);
      preparedTrackId.current = track.id;
      pendingSeek.current = 0;
      setSourceState({ loading: false });
      if (pendingPlay.current) {
        acquiredLease = await audioSessionOrchestrator.acquire('radio', 'radio-autoplay');
        if (request !== generation.current) {
          await releaseRadioLease(acquiredLease);
          return;
        }
        audioLease.current = acquiredLease;
        await TrackPlayer.play();
      }
    } catch {
      if (acquiredLease) await releaseRadioLease(acquiredLease);
      if (request !== generation.current) return;
      pendingPlay.current = false;
      setSourceState({ loading: false, error: '音频加载失败，请重试或切换下一首' });
    }
  }, [chooseUpcoming, releaseRadioLease, resolveTrack, setWaitingForNext]);

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
        if (value.schemaVersion !== 1 && value.schemaVersion !== 2) return;
        const { catalog, track } = findTrack(embeddedCatalogs, value.bankId, value.trackId);
        if (!catalog || !track) return;
        setBankId(catalog.bankId);
        setTrackId(track.id);
        setBankTrackIds(value.bankTrackIds ?? {});
        setModeState(['order', 'repeatOne', 'shuffle'].includes(value.mode) ? value.mode : 'order');
        setSubtitleModeState(['english', 'bilingual', 'off'].includes(value.subtitleMode) ? value.subtitleMode : 'off');
        setRateState(speedOptions.includes(value.rate as (typeof speedOptions)[number]) ? value.rate : 1);
        setIntervalSecondsState(migrateRadioIntervalSeconds(value));
        pendingSeek.current = Math.max(0, value.position || 0);
        setShuffle({ history: [track.id], cursor: 0 });
      } catch {
        // Invalid local state safely falls back to the first available track.
      }
    }).finally(() => { if (active) setRestored(true); });
    return () => { active = false; };
  }, [embeddedCatalogs]);

  useEffect(() => audioSessionOrchestrator.register('radio', {
    deactivate: async () => {
      pendingPlay.current = false;
      await TrackPlayer.pause();
      audioLease.current = undefined;
    },
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
      void TrackPlayer.getActiveTrack().then(async (activeTrack) => {
        if (waitingForNextRef.current || isNativeRadioIntervalTrack(activeTrack)) {
          setWaitingForNext(false);
          try {
            await TrackPlayer.skipToNext(0);
            if (pendingPlay.current) await TrackPlayer.play();
            else await TrackPlayer.pause();
          } catch {
            pendingPlay.current = false;
            await releaseRadioLease();
            setSourceState({ loading: false, error: '下一首音频暂时无法加载，请重试或手动切换' });
          }
          return;
        }
        pendingPlay.current = false;
        await releaseRadioLease();
        setSourceState({ loading: false, error: '音频播放失败，请重试或切换下一首' });
      }).catch(() => {
          pendingPlay.current = false;
          void releaseRadioLease();
          setSourceState({ loading: false, error: '音频播放失败，请重试或切换下一首' });
      });
      return;
    }
    if (event.type === Event.PlaybackQueueEnded) {
      pendingPlay.current = false;
      void releaseRadioLease();
      setSourceState({ loading: false, error: '下一首音频暂时无法加载，请重试或手动切换' });
      return;
    }
    const native = event.track;
    if (isNativeRadioIntervalTrack(native)) {
      setWaitingForNext(true);
      setSourceState({ loading: false });
      return;
    }
    if (!isNativeRadioContentTrack(native)) return;
    activeNativeContentTrack.current = native;
    const transitionedFromInterval = waitingForNextRef.current;
    setWaitingForNext(false);
    const { catalog, track } = findTrack(stateRef.current.catalogs, native.radioBankId, native.radioTrackId);
    if (!catalog || !track) return;
    preparedTrackId.current = track.id;
    setSourceState({ loading: false });
    if (native.radioTrackId === stateRef.current.trackId) {
      if (transitionedFromInterval) {
        queuedNextTrackId.current = undefined;
        void appendUpcoming(catalog, track, false, native).catch(() => undefined);
      }
      return;
    }
    queuedNextTrackId.current = undefined;
    nativeTransitionTrackId.current = track.id;
    setBankId(catalog.bankId);
    setTrackId(track.id);
    setBankTrackIds((current) => ({ ...current, [catalog.bankId]: track.id }));
    setShuffle((current) => selectShuffleTrack(current, track.id));
    void appendUpcoming(catalog, track, false, native).catch(() => undefined);
  });

  const play = useCallback(async () => {
    if (!currentCatalog || !currentTrack) return;
    setSessionVisible(true);
    pendingPlay.current = true;
    if (preparedTrackId.current !== currentTrack.id) {
      await prepareTrack(currentCatalog, currentTrack, { autoPlay: true, position });
      return;
    }
    let lease: AudioLease | undefined;
    try {
      lease = await audioSessionOrchestrator.acquire('radio', 'radio-play');
      audioLease.current = lease;
      if (!waitingForNextRef.current && (playback.state === State.Ended || position >= duration - 0.1)) await TrackPlayer.seekTo(0);
      await TrackPlayer.play();
    } catch {
      if (lease) await releaseRadioLease(lease);
      setSourceState({ loading: false, error: '音频播放失败，请重试或切换下一首' });
    }
  }, [currentCatalog, currentTrack, duration, playback.state, position, prepareTrack, releaseRadioLease]);

  const pause = useCallback(() => {
    pendingPlay.current = false;
    const lease = audioLease.current;
    void TrackPlayer.pause().then(() => releaseRadioLease(lease)).catch(() => undefined);
    void saveSnapshot();
  }, [releaseRadioLease, saveSnapshot]);

  const chooseTrack = useCallback((nextTrackId: string, autoPlay = true) => {
    const current = stateRef.current;
    const { catalog, track } = findTrack(current.catalogs, current.bankId, nextTrackId);
    if (!catalog || !track) return;
    pendingPlay.current = autoPlay;
    setWaitingForNext(false);
    requestedTrackId.current = track.id;
    setTrackId(track.id);
    setBankTrackIds((value) => ({ ...value, [catalog.bankId]: track.id }));
    setShuffle((value) => selectShuffleTrack(value, track.id));
    if (autoPlay) setSessionVisible(true);
    void prepareTrack(catalog, track, { autoPlay });
  }, [prepareTrack, setWaitingForNext]);

  const next = useCallback(async (autoPlay = true) => {
    const current = stateRef.current;
    const { catalog, track } = findTrack(current.catalogs, current.bankId, current.trackId);
    if (!catalog || !track) return;
    const result = nextManualTrack(catalog.tracks, track.id, current.mode, current.shuffle);
    if (!result.trackId) return;
    if (queuedNextTrackId.current === result.trackId && (current.intervalSeconds === 0 || waitingForNextRef.current)) {
      pendingPlay.current = autoPlay;
      setShuffle(result.shuffle);
      setWaitingForNext(false);
      await TrackPlayer.skipToNext(0);
      if (autoPlay) {
        let lease: AudioLease | undefined;
        try {
          lease = await audioSessionOrchestrator.acquire('radio', 'radio-next');
          audioLease.current = lease;
          await TrackPlayer.play();
        } catch {
          if (lease) await releaseRadioLease(lease);
          setSourceState({ loading: false, error: '音频播放失败，请重试或切换下一首' });
        }
      } else {
        await TrackPlayer.pause();
        await releaseRadioLease();
      }
      return;
    }
    chooseTrack(result.trackId, autoPlay);
  }, [chooseTrack, releaseRadioLease, setWaitingForNext]);

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
    if (waitingForNextRef.current) return;
    await TrackPlayer.seekTo(Math.max(0, Math.min(duration, position)));
  }, [duration]);

  const stopAndClear = useCallback(() => {
    generation.current += 1;
    pendingPlay.current = false;
    preparedTrackId.current = undefined;
    queuedNextTrackId.current = undefined;
    activeNativeContentTrack.current = undefined;
    setWaitingForNext(false);
    const lease = audioLease.current;
    void TrackPlayer.reset().then(() => releaseRadioLease(lease)).catch(() => {
      setSourceState({ loading: false, error: '音频停止失败，请稍后重试' });
    });
    setSessionVisible(false);
  }, [releaseRadioLease, setWaitingForNext]);

  useEffect(() => {
    setRadioRemoteHandlers({ next: () => next(true), pause, play, previous, seek, stop: stopAndClear });
    return () => setRadioRemoteHandlers(undefined);
  }, [next, pause, play, previous, seek, stopAndClear]);

  useEffect(() => {
    const interval = setInterval(() => { if (sessionVisible) void saveSnapshot(); }, 2_000);
    const subscription = AppState.addEventListener('change', (state) => { if (state !== 'active') void saveSnapshot(); });
    return () => { clearInterval(interval); subscription.remove(); };
  }, [saveSnapshot, sessionVisible]);

  const replaceWaitingUpcoming = useCallback(async (
    catalog: RadioCatalog,
    track: RadioTrack,
    nextMode: RadioPlaybackMode,
  ) => {
    const upcoming = nextMode === 'repeatOne'
      ? track
      : chooseUpcoming(catalog, track, nextMode, stateRef.current.shuffle);
    if (!upcoming) return;
    const nativeUpcoming = await resolveTrack(upcoming).catch(() => undefined);
    if (!nativeUpcoming || !waitingForNextRef.current) return;
    await TrackPlayer.removeUpcomingTracks();
    await TrackPlayer.add(nativeUpcoming);
    queuedNextTrackId.current = upcoming.id;
  }, [chooseUpcoming, resolveTrack]);

  const replacePreparedUpcoming = useCallback(async (
    catalog: RadioCatalog,
    track: RadioTrack,
    nextMode: RadioPlaybackMode,
    nextInterval: number,
  ) => {
    const queueBehavior = getRadioNativeQueueBehavior(nextMode, nextInterval);
    const upcoming = queueBehavior.automaticTarget === 'current'
      ? track
      : chooseUpcoming(catalog, track, nextMode, stateRef.current.shuffle);
    if (!upcoming) return;
    const source = activeNativeContentTrack.current ?? await resolveTrack(track);
    const nativeUpcoming = await resolveTrack(upcoming).catch(() => undefined);
    if (!nativeUpcoming || waitingForNextRef.current || preparedTrackId.current !== track.id) return;
    await TrackPlayer.removeUpcomingTracks();
    await TrackPlayer.setRepeatMode(queueBehavior.repeatsCurrentNatively ? RepeatMode.Track : RepeatMode.Off);
    if (queueBehavior.includesInterval) {
      await ensureRadioIntervalSilenceAsset().catch(() => undefined);
      await TrackPlayer.add([
        createNativeRadioIntervalTrack(source, nextInterval, nativeTrackInstance.current += 1),
        nativeUpcoming,
      ]);
    } else {
      await TrackPlayer.add(nativeUpcoming);
    }
    queuedNextTrackId.current = upcoming.id;
  }, [chooseUpcoming, resolveTrack]);

  const setMode = useCallback((nextMode: RadioPlaybackMode) => {
    stateRef.current.mode = nextMode;
    setModeState(nextMode);
    const current = stateRef.current;
    const { catalog, track } = findTrack(current.catalogs, current.bankId, current.trackId);
    if (!catalog || !track) return;
    if (waitingForNextRef.current) {
      void replaceWaitingUpcoming(catalog, track, nextMode).catch(() => undefined);
      return;
    }
    void replacePreparedUpcoming(catalog, track, nextMode, current.intervalSeconds).catch(() => undefined);
  }, [replacePreparedUpcoming, replaceWaitingUpcoming]);

  const setRate = useCallback((nextRate: number) => {
    stateRef.current.rate = nextRate;
    setRadioContentPlaybackRate(nextRate);
    setRateState(nextRate);
    if (!waitingForNextRef.current) void TrackPlayer.setRate(nextRate);
  }, []);

  const setIntervalSeconds = useCallback((nextValue: number) => {
    const nextInterval = clampRadioInterval(nextValue);
    if (nextInterval === stateRef.current.intervalSeconds) return;
    stateRef.current.intervalSeconds = nextInterval;
    setIntervalSecondsState(nextInterval);
    const current = stateRef.current;
    const { catalog, track } = findTrack(current.catalogs, current.bankId, current.trackId);
    if (!catalog || !track) return;
    if (waitingForNextRef.current) {
      if (nextInterval === 0) {
        const resume = playback.state === State.Playing;
        setWaitingForNext(false);
        void TrackPlayer.skipToNext(0).then(() => resume ? TrackPlayer.play() : TrackPlayer.pause()).catch(() => undefined);
      } else {
        void TrackPlayer.setRate(1).then(() => TrackPlayer.seekTo(radioIntervalStartPosition(nextInterval))).catch(() => undefined);
      }
      void saveSnapshot();
      return;
    }
    void replacePreparedUpcoming(catalog, track, current.mode, nextInterval).catch(() => undefined);
    void saveSnapshot();
  }, [playback.state, replacePreparedUpcoming, saveSnapshot, setWaitingForNext]);

  const value = useMemo<RadioContextValue>(() => ({
    catalogs,
    currentCatalog,
    currentTrack,
    currentIndex,
    mode,
    subtitleMode,
    rate,
    intervalSeconds,
    intervalRemaining,
    waitingForNext,
    speedOptions,
    playing,
    loading: sourceState.loading,
    buffering,
    error: sourceState.error,
    position,
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
    setRate,
    setIntervalSeconds,
    retry: () => {
      if (currentCatalog && currentTrack) void prepareTrack(currentCatalog, currentTrack, { autoPlay: true, forceRefresh: true, position });
    },
    stopAndClear,
  }), [bankTrackIds, buffering, catalogs, chooseTrack, currentCatalog, currentIndex, currentTrack, duration, intervalRemaining, intervalSeconds, mode, next, pause, play, playing, position, prepareTrack, previous, rate, seek, sessionVisible, setIntervalSeconds, setMode, setRate, sourceState.error, sourceState.loading, stopAndClear, subtitleMode, waitingForNext]);

  return <RadioContext.Provider value={value}>{children}</RadioContext.Provider>;
}

export function useRadioPlayer() {
  const value = useContext(RadioContext);
  if (!value) throw new Error('useRadioPlayer must be used inside RadioPlayerProvider');
  return value;
}
