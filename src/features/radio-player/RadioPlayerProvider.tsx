import TrackPlayer, {
  Event,
  RepeatMode,
  State,
  usePlaybackState,
  useProgress,
  useTrackPlayerEvents,
} from 'react-native-track-player';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type PropsWithChildren } from 'react';
import { AppState } from 'react-native';

import { resolveQuestionBankAsset, resolveRemoteQuestionBankAsset } from '@/features/question-bank/platform/resource-service';
import { useAuth } from '@/features/auth/AuthProvider';
import {
  nativeCommerceEnvironmentSnapshot,
  subscribeNativeCommerceEnvironment,
} from '@/features/native-commercial-testflight/commerce-environment';
import { getEmbeddedQuestionBanks } from '@/features/question-bank/data/repository.native';
import type { QuestionBankDataset } from '@/features/question-bank/types';
import { audioSessionOrchestrator, type AudioLease } from '@/platform/audio';

import { deriveRadioCatalogs, getEmbeddedRadioCatalogs, loadRadioCatalogDatasets } from './catalog.native';
import { hydrateRadioCatalogTopic, nextRadioCatalogTopic } from './catalog-hydration.native';
import { clampRadioInterval } from './radio-interval';
import {
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
import {
  activateRadioPlayerSession,
  clearRadioPlayerAccountData,
  readRadioPlayerSnapshot,
  registerRadioPlayerRuntimeReset,
  saveRadioPlayerSnapshot,
} from './radio-player-storage';
import { ensureRadioTrackPlayer, setRadioContentPlaybackRate, setRadioRemoteHandlers } from './track-player-runtime';
import type { RadioBankId, RadioCatalog, RadioPlaybackMode, RadioPlayerContextValue, RadioSubtitleMode, RadioTrack } from './types';

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

const RadioContext = createContext<RadioPlayerContextValue | undefined>(undefined);

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
  const auth = useAuth();
  const commerceEnvironmentSnapshot = useSyncExternalStore(
    subscribeNativeCommerceEnvironment,
    nativeCommerceEnvironmentSnapshot,
    nativeCommerceEnvironmentSnapshot,
  );
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
  const catalogDatasets = useRef<QuestionBankDataset[]>(getEmbeddedQuestionBanks());
  const catalogHydrationGeneration = useRef(0);
  const catalogHydrationTail = useRef<Promise<void>>(Promise.resolve());
  const waitingForNextRef = useRef(false);
  const audioLease = useRef<AudioLease | undefined>(undefined);
  const activeSessionUserId = useRef<string | undefined>(undefined);
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
    return saveRadioPlayerSnapshot(JSON.stringify({
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

  const resetAccountRuntime = useCallback(async () => {
    catalogHydrationGeneration.current += 1;
    catalogHydrationTail.current = Promise.resolve();
    catalogDatasets.current = getEmbeddedQuestionBanks();
    generation.current += 1;
    pendingPlay.current = false;
    pendingSeek.current = 0;
    preparedTrackId.current = undefined;
    requestedTrackId.current = undefined;
    queuedNextTrackId.current = undefined;
    nativeTransitionTrackId.current = undefined;
    activeNativeContentTrack.current = undefined;
    waitingForNextRef.current = false;
    const firstBankId = embeddedCatalogs[0]?.bankId ?? 'listening';
    const firstTrackId = embeddedCatalogs[0]?.tracks[0]?.id ?? '';
    const emptyShuffle: ShuffleState = {
      history: firstTrackId ? [firstTrackId] : [],
      cursor: firstTrackId ? 0 : -1,
    };
    stateRef.current = {
      bankId: firstBankId,
      trackId: firstTrackId,
      bankTrackIds: {},
      catalogs: embeddedCatalogs,
      intervalSeconds: 0,
      mode: 'order',
      subtitleMode: 'off',
      rate: 1,
      position: 0,
      shuffle: emptyShuffle,
    };
    setCatalogs(embeddedCatalogs);
    setBankId(firstBankId);
    setTrackId(firstTrackId);
    setBankTrackIds({});
    setModeState('order');
    setSubtitleModeState('off');
    setRateState(1);
    setIntervalSecondsState(0);
    setWaitingForNextState(false);
    setSourceState({ loading: false });
    setSessionVisible(false);
    setRestored(false);
    setShuffle(emptyShuffle);
    const lease = audioLease.current;
    await TrackPlayer.reset().catch(() => undefined);
    await releaseRadioLease(lease);
  }, [embeddedCatalogs, releaseRadioLease]);

  useEffect(() => registerRadioPlayerRuntimeReset(resetAccountRuntime), [resetAccountRuntime]);

  const hydrateTrackTopic = useCallback(async (track: RadioTrack) => {
    const requestGeneration = catalogHydrationGeneration.current;
    let result = findTrack(stateRef.current.catalogs, track.bankId, track.id);
    const previous = catalogHydrationTail.current;
    const task = previous.catch(() => undefined).then(async () => {
      if (catalogHydrationGeneration.current !== requestGeneration) return;
      const nextDatasets = await hydrateRadioCatalogTopic(
        catalogDatasets.current,
        track.bankId,
        track.categoryId,
        track.topicId,
      );
      if (catalogHydrationGeneration.current !== requestGeneration) return;
      if (nextDatasets !== catalogDatasets.current) {
        catalogDatasets.current = nextDatasets;
        const nextCatalogs = deriveRadioCatalogs(nextDatasets);
        stateRef.current.catalogs = nextCatalogs;
        setCatalogs(nextCatalogs);
        result = findTrack(nextCatalogs, track.bankId, track.id);
      }
    });
    catalogHydrationTail.current = task;
    await task;
    return result;
  }, []);

  const hydrateFollowingTrackTopic = useCallback(async (track: RadioTrack) => {
    const requestGeneration = catalogHydrationGeneration.current;
    let result: { catalog?: RadioCatalog; track?: RadioTrack } = {};
    const previous = catalogHydrationTail.current;
    const task = previous.catch(() => undefined).then(async () => {
      if (catalogHydrationGeneration.current !== requestGeneration) return;
      const nextTopic = nextRadioCatalogTopic(catalogDatasets.current, {
        bankId: track.bankId,
        categoryId: track.categoryId,
        topicId: track.topicId,
      });
      if (!nextTopic) return;
      const nextDatasets = await hydrateRadioCatalogTopic(
        catalogDatasets.current,
        nextTopic.bankId,
        nextTopic.categoryId,
        nextTopic.topicId,
      );
      if (catalogHydrationGeneration.current !== requestGeneration) return;
      catalogDatasets.current = nextDatasets;
      const nextCatalogs = deriveRadioCatalogs(nextDatasets);
      stateRef.current.catalogs = nextCatalogs;
      setCatalogs(nextCatalogs);
      const catalog = nextCatalogs.find((candidate) => candidate.bankId === nextTopic.bankId);
      result = {
        catalog,
        track: catalog?.tracks.find((candidate) => (
          candidate.categoryId === nextTopic.categoryId && candidate.topicId === nextTopic.topicId
        )),
      };
    });
    catalogHydrationTail.current = task;
    await task;
    return result;
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
      artist: '听你五个',
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
    const lastTopicTrack = catalog.tracks.filter((candidate) => (
      candidate.categoryId === track.categoryId && candidate.topicId === track.topicId
    )).at(-1)?.id === track.id;
    const following = queueBehavior.automaticTarget !== 'current' && currentMode === 'order' && lastTopicTrack
      ? await hydrateFollowingTrackTopic(track)
      : undefined;
    const upcoming = queueBehavior.automaticTarget === 'current'
      ? track
      : following?.track ?? chooseUpcoming(catalog, track, currentMode, stateRef.current.shuffle);
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
  }, [chooseUpcoming, hydrateFollowingTrackTopic, resolveTrack]);

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
    if (auth.restoring || !auth.session) return;
    let active = true;
    const requestGeneration = catalogHydrationGeneration.current + 1;
    catalogHydrationGeneration.current = requestGeneration;
    catalogHydrationTail.current = Promise.resolve();
    void loadRadioCatalogDatasets().then((datasets) => {
      if (!active || catalogHydrationGeneration.current !== requestGeneration) return;
      catalogDatasets.current = datasets;
      const next = deriveRadioCatalogs(datasets);
      if (next.length) {
        stateRef.current.catalogs = next;
        setCatalogs(next);
      }
    }).catch(() => undefined);
    return () => {
      active = false;
      if (catalogHydrationGeneration.current === requestGeneration) catalogHydrationGeneration.current += 1;
    };
  }, [auth.restoring, auth.session, commerceEnvironmentSnapshot]);

  useEffect(() => {
    if (auth.restoring) return;
    let active = true;
    const userId = auth.session?.user.id;
    if (!userId) {
      void clearRadioPlayerAccountData()
        .then(() => { if (active) activeSessionUserId.current = undefined; })
        .catch(() => undefined);
      return () => { active = false; };
    }
    const activateAndRestore = async () => {
      if (activeSessionUserId.current && activeSessionUserId.current !== userId) {
        await clearRadioPlayerAccountData();
      }
      if (!active) return;
      if (!await activateRadioPlayerSession() || !active) return;
      activeSessionUserId.current = userId;
      const raw = await readRadioPlayerSnapshot();
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
    };
    void activateAndRestore().finally(() => { if (active) setRestored(true); });
    return () => { active = false; };
  }, [auth.restoring, auth.session?.user.id, embeddedCatalogs]);

  useEffect(() => audioSessionOrchestrator.register('radio', {
    deactivate: async () => {
      pendingPlay.current = false;
      await TrackPlayer.pause();
      audioLease.current = undefined;
    },
  }), []);

  useEffect(() => {
    if (!restored || !auth.session || !currentCatalog || !currentTrack) return;
    if (nativeTransitionTrackId.current === currentTrack.id || requestedTrackId.current === currentTrack.id) {
      nativeTransitionTrackId.current = undefined;
      requestedTrackId.current = undefined;
      return;
    }
    const restorePosition = preparedTrackId.current ? 0 : pendingSeek.current;
    void prepareTrack(currentCatalog, currentTrack, { autoPlay: pendingPlay.current, position: restorePosition });
  }, [auth.session, currentCatalog, currentTrack, prepareTrack, restored]);

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
        void hydrateTrackTopic(track).then((hydrated) => appendUpcoming(
          hydrated.catalog ?? catalog,
          hydrated.track ?? track,
          false,
          native,
        )).catch(() => undefined);
      }
      return;
    }
    queuedNextTrackId.current = undefined;
    nativeTransitionTrackId.current = track.id;
    setBankId(catalog.bankId);
    setTrackId(track.id);
    setBankTrackIds((current) => ({ ...current, [catalog.bankId]: track.id }));
    setShuffle((current) => selectShuffleTrack(current, track.id));
    void hydrateTrackTopic(track).then((hydrated) => appendUpcoming(
      hydrated.catalog ?? catalog,
      hydrated.track ?? track,
      false,
      native,
    )).catch(() => undefined);
  });

  const play = useCallback(async () => {
    if (!currentCatalog || !currentTrack) return;
    setSessionVisible(true);
    pendingPlay.current = true;
    const hydrated = await hydrateTrackTopic(currentTrack);
    const playCatalog = hydrated.catalog ?? currentCatalog;
    const playTrack = hydrated.track ?? currentTrack;
    if (preparedTrackId.current !== playTrack.id) {
      await prepareTrack(playCatalog, playTrack, { autoPlay: true, position });
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
  }, [currentCatalog, currentTrack, duration, hydrateTrackTopic, playback.state, position, prepareTrack, releaseRadioLease]);

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
    void hydrateTrackTopic(track).then((hydrated) => {
      if (requestedTrackId.current !== track.id) return;
      return prepareTrack(hydrated.catalog ?? catalog, hydrated.track ?? track, { autoPlay });
    });
  }, [hydrateTrackTopic, prepareTrack, setWaitingForNext]);

  const next = useCallback(async (autoPlay = true) => {
    const current = stateRef.current;
    const { catalog, track } = findTrack(current.catalogs, current.bankId, current.trackId);
    if (!catalog || !track) return;
    const requestedTrackAtStart = requestedTrackId.current;
    const lastTopicTrack = catalog.tracks.filter((candidate) => (
      candidate.categoryId === track.categoryId && candidate.topicId === track.topicId
    )).at(-1)?.id === track.id;
    if (current.mode === 'order' && lastTopicTrack) {
      const following = await hydrateFollowingTrackTopic(track);
      if (
        stateRef.current.trackId !== track.id
        || requestedTrackId.current !== requestedTrackAtStart
      ) return;
      if (following.track) {
        chooseTrack(following.track.id, autoPlay);
        return;
      }
    }
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
  }, [chooseTrack, hydrateFollowingTrackTopic, releaseRadioLease, setWaitingForNext]);

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

  const value = useMemo<RadioPlayerContextValue>(() => ({
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
    activateSession: () => {
      setSessionVisible(true);
      const current = stateRef.current;
      const selected = findTrack(current.catalogs, current.bankId, current.trackId).track;
      if (selected) void hydrateTrackTopic(selected);
    },
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
      if (track) void hydrateTrackTopic(track).then((hydrated) => {
        if (requestedTrackId.current !== track.id) return;
        return prepareTrack(hydrated.catalog ?? catalog, hydrated.track ?? track, { autoPlay: false });
      });
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
  }), [bankTrackIds, buffering, catalogs, chooseTrack, currentCatalog, currentIndex, currentTrack, duration, hydrateTrackTopic, intervalRemaining, intervalSeconds, mode, next, pause, play, playing, position, prepareTrack, previous, rate, seek, sessionVisible, setIntervalSeconds, setMode, setRate, sourceState.error, sourceState.loading, stopAndClear, subtitleMode, waitingForNext]);

  return <RadioContext.Provider value={value}>{children}</RadioContext.Provider>;
}

export function useRadioPlayer() {
  const value = useContext(RadioContext);
  if (!value) throw new Error('useRadioPlayer must be used inside RadioPlayerProvider');
  return value;
}
