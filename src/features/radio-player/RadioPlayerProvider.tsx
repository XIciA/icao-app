import { normalizeStudyScope } from '@icao/contracts';
import { useProfile } from '@/features/account/profile-store.native';
import { scopeDataset } from '@/features/question-bank/lib/study-scope';
import TrackPlayer, {
  Event,
  RepeatMode,
  State,
  usePlaybackState,
  useProgress,
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
import { reportRadioFailure, radioCanRetry, radioErrorMessage, withRadioTimeout } from './operation-coordinator';
import { clampRadioInterval } from './radio-interval';
import {
  createNativeRadioIntervalTrack,
  selectNativeShuffleTrack as selectShuffleTrack,
  ensureRadioIntervalSilenceAsset,
  getRadioArtwork,
  getRadioNativeQueueBehavior,
  isNativeRadioContentTrack,
  isNativeRadioIntervalTrack,
  type NativeRadioContentTrack,
} from './native-queue';
import { nextTrack, previousTrack, type ShuffleState } from './queue';
import { migrateRadioIntervalSeconds } from './radio-snapshot';
import {
  activateRadioPlayerSession,
  clearRadioPlayerAccountData,
  readRadioPlayerSnapshot,
  registerRadioPlayerRuntimeReset,
  saveRadioPlayerSnapshot,
} from './radio-player-storage';
import { mutateRadioPlayer, setRadioPlaybackHandler, type RadioPlaybackEvent, ensureRadioTrackPlayer, setRadioContentPlaybackRate, setRadioRemoteHandlers } from './track-player-runtime';
import type { RadioBankId, RadioCatalog, RadioPlaybackMode, RadioPlayerContextValue, RadioSubtitleMode, RadioTrack } from './types';

const speedOptions = [0.75, 1, 1.25, 1.5] as const;

type Snapshot = {
  schemaVersion: 1 | 2;
  bankId: RadioBankId;
  trackId: string;
  categoryId?: string;
  topicId?: string;
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
  const profile = useProfile();
  const [playerReady, setPlayerReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const mounted = useRef(true);
  const initialize = useCallback(async () => {
    setFailed(false);
    try {
      await withRadioTimeout(ensureRadioTrackPlayer());
      if (mounted.current) setPlayerReady(true);
    } catch {
      if (mounted.current) setFailed(true);
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    void initialize();
    return () => { mounted.current = false; };
  }, [initialize]);
  if (playerReady) return <ReadyRadioPlayerProvider>{children}</ReadyRadioPlayerProvider>;
  // Radio initialization must not strand the entire App on an empty screen.
  // Native hooks mount only after setup; other features remain accessible on failure.
  const catalogs = getEmbeddedRadioCatalogs({ scope: normalizeStudyScope(profile.studyScope), target: profile.target });
  const noop = () => undefined;
  const unavailable: RadioPlayerContextValue = {
    catalogs, currentCatalog: catalogs[0], currentTrack: catalogs[0]?.tracks[0], currentIndex: 0,
    mode: 'order', subtitleMode: 'off', rate: 1, intervalSeconds: 0, intervalRemaining: 0,
    waitingForNext: false, speedOptions, playing: false, loading: !failed, buffering: false,
    error: failed ? '播放器暂时无法启动，请重试' : undefined,
    position: 0, duration: 0, sessionVisible: false,
    activateSession: () => { if (failed) void initialize(); },
    play: initialize, pause: noop, toggle: initialize, seek: async () => undefined,
    next: initialize, previous: initialize, selectBank: noop, selectTrack: noop,
    setMode: noop, setSubtitleMode: noop, setRate: noop, setIntervalSeconds: noop,
    retry: () => { void initialize(); }, stopAndClear: noop,
  };
  return <RadioContext.Provider value={unavailable}>{children}</RadioContext.Provider>;
}

function ReadyRadioPlayerProvider({ children }: PropsWithChildren) {
  const auth = useAuth();
  const commerceEnvironmentSnapshot = useSyncExternalStore(
    subscribeNativeCommerceEnvironment,
    nativeCommerceEnvironmentSnapshot,
    nativeCommerceEnvironmentSnapshot,
  );
  const profile = useProfile();
  const selection = useMemo(() => ({ scope: normalizeStudyScope(profile.studyScope), target: profile.target }), [profile.studyScope, profile.target]);
  const selectionRef = useRef(selection); selectionRef.current = selection;
  const embeddedCatalogs = useMemo(() => getEmbeddedRadioCatalogs(selection), [selection]);
  const [catalogs, setCatalogs] = useState(embeddedCatalogs);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState<string>();
  const [catalogRetry, setCatalogRetry] = useState(0);
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
  const queueRevision = useRef(0);
  const recovery = useRef<Promise<void> | undefined>(undefined);
  const recoveryAttempts = useRef(new Map<string, number>());
  const upcomingTask = useRef<Promise<void> | undefined>(undefined);
  const upcomingReady = useRef<Promise<void> | undefined>(undefined);
  const preparedTrackId = useRef<string | undefined>(undefined);
  const requestedTrackId = useRef<string | undefined>(undefined);
  const queuedNextTrackId = useRef<string | undefined>(undefined);
  const pendingPlay = useRef(false);
  const interrupted = useRef<{ request: number; resume: boolean } | undefined>(undefined);
  const pendingSeek = useRef(0);
  const nativeTransitionTrackId = useRef<string | undefined>(undefined);
  const nativeTrackInstance = useRef(0);
  const activeNativeContentTrack = useRef<NativeRadioContentTrack | undefined>(undefined);
  const catalogDatasets = useRef<QuestionBankDataset[]>(getEmbeddedQuestionBanks().map((bank) => scopeDataset(bank, selection.scope, selection.target)));
  const catalogHydrationGeneration = useRef(0);
  const topicHydrations = useRef(new Map<string, Promise<void>>());
  const waitingForNextRef = useRef(false);
  const audioLease = useRef<AudioLease | undefined>(undefined);
  const activeSessionUserId = useRef<string | undefined>(undefined);
  const stateRef = useRef({ bankId, trackId, bankTrackIds, catalogs, intervalSeconds, mode, subtitleMode, rate, position: 0, shuffle });

  const { catalog: currentCatalog, track: currentTrack } = findTrack(catalogs, bankId, trackId);
  const currentIndex = currentTrack ? currentCatalog?.tracks.findIndex((track) => track.id === currentTrack.id) ?? -1 : -1;
  const contentDuration = currentTrack?.durationSeconds || 0;
  const duration = waitingForNext ? contentDuration : progress.duration || contentDuration;
  const position = waitingForNext ? contentDuration : progress.position;
  const intervalRemaining = waitingForNext
    ? Math.max(0, Math.ceil((progress.duration || intervalSeconds) - progress.position))
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
      categoryId: findTrack(current.catalogs, current.bankId, current.trackId).track?.categoryId,
      topicId: findTrack(current.catalogs, current.bankId, current.trackId).track?.topicId,
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
    topicHydrations.current.clear();
    catalogDatasets.current = getEmbeddedQuestionBanks().map((bank) => scopeDataset(bank, selectionRef.current.scope, selectionRef.current.target));
    generation.current += 1;
    queueRevision.current += 1;
    recoveryAttempts.current.clear();
    interrupted.current = undefined;
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
    setCatalogLoading(false);
    setCatalogError(undefined);
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
    await mutateRadioPlayer(() => true, () => TrackPlayer.reset()).catch(() => undefined);
    await releaseRadioLease(lease);
  }, [embeddedCatalogs, releaseRadioLease]);

  useEffect(() => registerRadioPlayerRuntimeReset(resetAccountRuntime), [resetAccountRuntime]);
  const previousSelection = useRef(selection);
  useEffect(() => {
    if (previousSelection.current === selection) return;
    previousSelection.current = selection;
    void resetAccountRuntime();
  }, [selection, resetAccountRuntime]);

  const hydrateTopic = useCallback(async (identity: Pick<RadioTrack, 'bankId' | 'categoryId' | 'topicId'>) => {
    const request = catalogHydrationGeneration.current;
    const key = `${request}:${identity.bankId}:${identity.categoryId}:${identity.topicId}`;
    let task = topicHydrations.current.get(key);
    if (!task) {
      task = (async () => {
        const initial = catalogDatasets.current;
        const hydrated = await withRadioTimeout(hydrateRadioCatalogTopic(initial, identity.bankId, identity.categoryId, identity.topicId));
        if (catalogHydrationGeneration.current !== request || initial === hydrated) return;
        const topic = hydrated.find((bank) => bank.id === identity.bankId)?.categories
          .find((category) => category.id === identity.categoryId)?.topics.find((item) => item.id === identity.topicId);
        if (!topic) return;
        // Concurrent topics merge independently; a late response never restores an older whole catalog.
        catalogDatasets.current = catalogDatasets.current.map((bank) => bank.id !== identity.bankId ? bank : {
          ...bank,
          categories: bank.categories.map((category) => category.id !== identity.categoryId ? category : {
            ...category, topics: category.topics.map((item) => item.id === identity.topicId ? topic : item),
          }),
        });
        const nextCatalogs = deriveRadioCatalogs(catalogDatasets.current, selectionRef.current);
        stateRef.current.catalogs = nextCatalogs;
        setCatalogs(nextCatalogs);
      })();
      topicHydrations.current.set(key, task);
    }
    try { await task; }
    finally { if (topicHydrations.current.get(key) === task) topicHydrations.current.delete(key); }
  }, []);

  const hydrateTrackTopic = useCallback(async (track: RadioTrack) => {
    await hydrateTopic(track);
    return findTrack(stateRef.current.catalogs, track.bankId, track.id);
  }, [hydrateTopic]);

  const hydrateFollowingTrackTopic = useCallback(async (track: RadioTrack) => {
    const request = catalogHydrationGeneration.current;
    const nextTopic = nextRadioCatalogTopic(catalogDatasets.current, track);
    if (!nextTopic) return {};
    await hydrateTopic(nextTopic);
    if (request !== catalogHydrationGeneration.current) return {};
    const catalog = stateRef.current.catalogs.find((candidate) => candidate.bankId === nextTopic.bankId);
    return { catalog, track: catalog?.tracks.find((item) => item.categoryId === nextTopic.categoryId && item.topicId === nextTopic.topicId) };
  }, [hydrateTopic]);

  const resolveTrack = useCallback(async (track: RadioTrack, forceRefresh = false, isCurrent: () => boolean = () => true): Promise<NativeRadioContentTrack> => {
    const request = generation.current;
    const local = resolveQuestionBankAsset(track.audioPath);
    const remote = await withRadioTimeout(resolveRemoteQuestionBankAsset(track.audioPath, { forceRefresh, preferDownloaded: true, isCurrent: () => request === generation.current && isCurrent() }));
    const uri = remote ?? local;
    if (!uri) throw new Error('resource_unavailable');
    return {
      id: `radio:${track.bankId}:${track.id}:${request}:${nativeTrackInstance.current += 1}`,
      url: uri,
      title: track.title,
      artist: '听你五个',
      artwork: getRadioArtwork(),
      album: `${track.bankTitle} · ${track.topicTitle}`,
      duration: track.durationSeconds,
      radioTrackId: track.id,
      radioBankId: track.bankId,
      radioTrackKind: 'content',
      radioGeneration: request,
    };
  }, []);

  const chooseUpcoming = useCallback(async (catalog: RadioCatalog, track: RadioTrack, currentMode: RadioPlaybackMode, currentShuffle: ShuffleState) => {
    if (currentMode === 'repeatOne') return track;
    const lastTopicTrack = catalog.tracks.filter((candidate) => (
      candidate.categoryId === track.categoryId && candidate.topicId === track.topicId
    )).at(-1)?.id === track.id;
    if (currentMode === 'order' && lastTopicTrack) {
      const following = await hydrateFollowingTrackTopic(track);
      if (following.track) return following.track;
    }
    const hydratedCatalog = stateRef.current.catalogs.find((item) => item.bankId === catalog.bankId) ?? catalog;
    const result = nextTrack(hydratedCatalog.tracks, track.id, currentMode, currentShuffle);
    return hydratedCatalog.tracks.find((item) => item.id === result.trackId);
  }, [hydrateFollowingTrackTopic]);

  const appendUpcoming = useCallback(async (
    catalog: RadioCatalog,
    track: RadioTrack,
    forceRefresh = false,
    nativeSource?: NativeRadioContentTrack,
  ) => {
    const request = generation.current;
    const revision = ++queueRevision.current;
    const valid = () => request === generation.current && revision === queueRevision.current
      && (!nativeSource || activeNativeContentTrack.current?.id === nativeSource.id);
    const currentMode = stateRef.current.mode;
    const currentInterval = stateRef.current.intervalSeconds;
    const behavior = getRadioNativeQueueBehavior(currentMode, currentInterval);
    let ready!: () => void;
    upcomingReady.current = new Promise<void>((resolve) => { ready = resolve; });
    const task = (async () => {
      // Keep native content and at most three prepared successors, never an unbounded history.
      await mutateRadioPlayer(valid, async () => {
        const activeIndex = await TrackPlayer.getActiveTrackIndex();
        if (activeIndex && activeIndex > 0) await TrackPlayer.remove(Array.from({ length: activeIndex }, (_, i) => i));
        await TrackPlayer.setRepeatMode(behavior.repeatsCurrentNatively && !waitingForNextRef.current ? RepeatMode.Track : RepeatMode.Off);
      });
      if (behavior.repeatsCurrentNatively || !valid()) return;
      let source = nativeSource ?? activeNativeContentTrack.current;
      let previous = track;
      let previousCatalog = catalog;
      let projectedShuffle = stateRef.current.shuffle;
      // Resources are resolved outside the mutation lock, so a slow prefetch cannot block stop or selection.
      const nativeQueue = await TrackPlayer.getQueue();
      if (!valid()) return;
      const activeIndex = await TrackPlayer.getActiveTrackIndex() ?? 0;
      let prepared = nativeQueue.slice(activeIndex + 1).filter(isNativeRadioContentTrack);
      if (prepared.length) {
        ready();
        const last = prepared.at(-1)!;
        const result = findTrack(stateRef.current.catalogs, last.radioBankId, last.radioTrackId);
        if (result.track && result.catalog) { previous = result.track; previousCatalog = result.catalog; source = last; }
        for (const item of prepared) projectedShuffle = selectShuffleTrack(projectedShuffle, item.radioTrackId);
        queuedNextTrackId.current = prepared[0].radioTrackId;
      }
      for (let count = prepared.length; count < 3 && valid(); count += 1) {
        const upcoming = await chooseUpcoming(previousCatalog, previous, currentMode, projectedShuffle);
        if (!upcoming || !valid()) return;
        let nativeUpcoming: NativeRadioContentTrack;
        try { nativeUpcoming = await resolveTrack(upcoming, forceRefresh, valid); }
        catch (error) {
          if (!radioCanRetry(error) || !valid()) throw error;
          nativeUpcoming = await resolveTrack(upcoming, true, valid);
        }
        if (!valid()) return;
        if (behavior.includesInterval) await ensureRadioIntervalSilenceAsset(currentInterval);
        await mutateRadioPlayer(valid, async () => {
          await TrackPlayer.add(behavior.includesInterval && source && !(count === 0 && waitingForNextRef.current)
            ? [createNativeRadioIntervalTrack(source, currentInterval, ++nativeTrackInstance.current), nativeUpcoming]
            : [nativeUpcoming]);
          if (count === 0) queuedNextTrackId.current = upcoming.id;
        });
        ready();
        source = nativeUpcoming;
        previous = upcoming;
        previousCatalog = stateRef.current.catalogs.find((item) => item.bankId === upcoming.bankId) ?? catalog;
        projectedShuffle = selectShuffleTrack(projectedShuffle, upcoming.id);
      }
    })();
    upcomingTask.current = task;
    try { await task; }
    finally { ready(); if (upcomingTask.current === task) upcomingTask.current = undefined; }
  }, [chooseUpcoming, resolveTrack]);

  const prepareTrack = useCallback(async (
    catalog: RadioCatalog,
    track: RadioTrack,
    { autoPlay, forceRefresh = false, position = 0 }: { autoPlay: boolean; forceRefresh?: boolean; position?: number },
  ) => {
    const request = ++generation.current;
    queueRevision.current += 1;
    const valid = () => request === generation.current;
    pendingPlay.current = autoPlay && !interrupted.current;
    pendingSeek.current = Math.max(0, position);
    preparedTrackId.current = undefined;
    activeNativeContentTrack.current = undefined;
    queuedNextTrackId.current = undefined;
    setWaitingForNext(false);
    setSourceState({ loading: true });
    try {
      await ensureRadioTrackPlayer();
      await mutateRadioPlayer(valid, () => TrackPlayer.pause());
      if (!valid()) return;
      await releaseRadioLease();
      if (!valid()) return;
      let nativeTrack: NativeRadioContentTrack;
      try { nativeTrack = await resolveTrack(track, forceRefresh); }
      catch (error) {
        if (!radioCanRetry(error) || !valid()) throw error;
        nativeTrack = await resolveTrack(track, true);
      }
      if (!valid()) return;
      await mutateRadioPlayer(valid, async () => {
        const current = stateRef.current;
        await TrackPlayer.reset();
        activeNativeContentTrack.current = nativeTrack;
        // Publish identity before native events can arrive for the new queue.
        preparedTrackId.current = track.id;
        await TrackPlayer.add(nativeTrack);
        await TrackPlayer.setRepeatMode(getRadioNativeQueueBehavior(current.mode, current.intervalSeconds).repeatsCurrentNatively ? RepeatMode.Track : RepeatMode.Off);
        setRadioContentPlaybackRate(current.rate);
        await TrackPlayer.setRate(current.rate);
        const target = Math.max(0, position);
        const seek = track.durationSeconds > 0 ? Math.min(target, Math.max(0, track.durationSeconds - 0.25)) : target;
        if (seek > 0) await TrackPlayer.seekTo(seek);
        if (!valid()) return;
        pendingSeek.current = 0;
        setSourceState({ loading: false });
      });
      if (!valid()) return;
      if (pendingPlay.current) {
        const lease = await audioSessionOrchestrator.acquire('radio', 'radio-autoplay');
        if (!valid() || !pendingPlay.current) { await releaseRadioLease(lease); return; }
        audioLease.current = lease;
        await mutateRadioPlayer(() => valid() && pendingPlay.current, () => TrackPlayer.play());
      }
      if (!valid()) return;
      // Starting the requested content never waits for the next three downloads.
      void appendUpcoming(catalog, track, forceRefresh, nativeTrack).catch((error) => {
        reportRadioFailure(error, request, 'prefetch');
        // Current playback remains available; exhaustion has a bounded recovery path.
      });
    } catch (error) {
      if (!valid()) return;
      pendingPlay.current = false;
      await releaseRadioLease();
      reportRadioFailure(error, generation.current, 'operation');
      setSourceState({ loading: false, error: radioErrorMessage(error) });
    }
  }, [appendUpcoming, releaseRadioLease, resolveTrack, setWaitingForNext]);

  useEffect(() => {
    if (auth.restoring || !auth.session) return;
    let active = true;
    const requestGeneration = catalogHydrationGeneration.current + 1;
    catalogHydrationGeneration.current = requestGeneration;
    topicHydrations.current.clear();
    setCatalogLoading(true);
    setCatalogError(undefined);
    void loadRadioCatalogDatasets(selectionRef.current, { complete: sessionVisible }).then((datasets) => {
      if (!active || catalogHydrationGeneration.current !== requestGeneration) return;
      catalogDatasets.current = datasets;
      const next = deriveRadioCatalogs(datasets, selectionRef.current);
      if (next.length) {
        stateRef.current.catalogs = next;
        setCatalogs(next);
      }
    }).catch(() => {
      if (active && catalogHydrationGeneration.current === requestGeneration) setCatalogError('播放目录加载失败，请重试');
    }).finally(() => {
      if (active && catalogHydrationGeneration.current === requestGeneration) setCatalogLoading(false);
    });
    return () => {
      active = false;
      if (catalogHydrationGeneration.current === requestGeneration) catalogHydrationGeneration.current += 1;
    };
  }, [auth.restoring, auth.session, catalogRetry, commerceEnvironmentSnapshot, selection, sessionVisible]);

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
        let available = stateRef.current.catalogs;
        if (value.categoryId && value.topicId) {
          const datasets = await withRadioTimeout(loadRadioCatalogDatasets(selectionRef.current));
          if (!active) return;
          const hydrated = await withRadioTimeout(hydrateRadioCatalogTopic(datasets, value.bankId, value.categoryId, value.topicId));
          if (!active) return;
          catalogDatasets.current = hydrated;
          available = deriveRadioCatalogs(hydrated, selectionRef.current);
          stateRef.current.catalogs = available;
          setCatalogs(available);
        }
        const { catalog, track } = findTrack(available, value.bankId, value.trackId);
        if (!catalog || !track) return;
        setBankId(catalog.bankId);
        setTrackId(track.id);
        setBankTrackIds(value.bankTrackIds ?? {});
        setModeState(['order', 'repeatOne', 'shuffle'].includes(value.mode) ? value.mode : 'order');
        setSubtitleModeState(['english', 'bilingual', 'off'].includes(value.subtitleMode) ? value.subtitleMode : 'off');
        setRateState(speedOptions.includes(value.rate as (typeof speedOptions)[number]) ? value.rate : 1);
        setIntervalSecondsState(migrateRadioIntervalSeconds(value));
        pendingSeek.current = track.id === value.trackId ? Math.max(0, value.position || 0) : 0;
        setShuffle({ history: [track.id], cursor: 0 });
      } catch {
        // Invalid local state safely falls back to the first available track.
      }
    };
    void activateAndRestore().catch(() => undefined).finally(() => { if (active) setRestored(true); });
    return () => { active = false; };
  }, [auth.restoring, auth.session?.user.id, embeddedCatalogs]);

  useEffect(() => audioSessionOrchestrator.register('radio', {
    deactivate: async () => {
      pendingPlay.current = false;
      if (interrupted.current) interrupted.current.resume = false;
      // Exclusive owner transfer must pause even when a new Play intent arrives meanwhile.
      await mutateRadioPlayer(() => true, () => TrackPlayer.pause());
      audioLease.current = undefined;
    },
  }), []);

  useEffect(() => {
    if (!restored || !auth.session || !currentCatalog || !currentTrack || !sessionVisible) return;
    if (preparedTrackId.current === currentTrack.id || nativeTransitionTrackId.current === currentTrack.id || requestedTrackId.current === currentTrack.id) {
      nativeTransitionTrackId.current = undefined;
      requestedTrackId.current = undefined;
      return;
    }
    const restorePosition = preparedTrackId.current ? 0 : pendingSeek.current;
    void prepareTrack(currentCatalog, currentTrack, { autoPlay: pendingPlay.current, position: restorePosition });
  }, [auth.session, currentCatalog, currentTrack, prepareTrack, restored, sessionVisible]);

  const playbackEvent = useRef<(event: RadioPlaybackEvent) => void>(() => undefined);
  playbackEvent.current = (event) => {
    if (event.type === Event.RemoteDuck) {
      if (event.paused) {
        interrupted.current ??= { request: generation.current, resume: pendingPlay.current };
        if (event.permanent) interrupted.current.resume = false;
        pendingPlay.current = false;
        void mutateRadioPlayer(() => !pendingPlay.current, () => TrackPlayer.pause()).catch(() => undefined);
        if (event.permanent) interrupted.current = undefined;
      } else {
        const interruption = interrupted.current;
        interrupted.current = undefined;
        if (interruption?.resume && interruption.request === generation.current) void play();
      }
      return;
    }
    if (event.type === Event.PlaybackError || event.type === Event.PlaybackQueueEnded) {
      reportRadioFailure(event, generation.current, event.type);
      if (recovery.current || !pendingPlay.current || !preparedTrackId.current || !activeNativeContentTrack.current) return;
      const request = generation.current;
      const valid = () => generation.current === request && pendingPlay.current;
      const task = (async () => {
        const active = await TrackPlayer.getActiveTrack();
        if (!valid()) return;
        const current = stateRef.current;
        const result = isNativeRadioContentTrack(active)
          ? findTrack(current.catalogs, active.radioBankId, active.radioTrackId)
          : findTrack(current.catalogs, current.bankId, current.trackId);
        if (!result.catalog || !result.track) return;
        let { catalog, track } = result;
        if (event.type === Event.PlaybackQueueEnded || isNativeRadioIntervalTrack(active)) {
          setSourceState({ loading: true });
          if (upcomingReady.current) await withRadioTimeout(upcomingReady.current);
          if (!valid()) return;
          const queued = queuedNextTrackId.current;
          const upcoming = (queued && catalog.tracks.find((item) => item.id === queued))
            || await chooseUpcoming(catalog, track, current.mode, current.shuffle);
          if (!valid() || !upcoming) return;
          track = upcoming;
          catalog = stateRef.current.catalogs.find((item) => item.bankId === track.bankId) ?? catalog;
        }
        const key = `${track.bankId}:${track.id}`;
        const attempts = recoveryAttempts.current.get(key) ?? 0;
        if (attempts >= 1) throw Object.assign(new Error('audio_playback_failed'), { code: event.code });
        recoveryAttempts.current.set(key, attempts + 1);
        if (!valid()) return;
        stateRef.current.trackId = track.id;
        stateRef.current.bankId = catalog.bankId;
        requestedTrackId.current = track.id;
        setTrackId(track.id);
        setBankId(catalog.bankId);
        const resumePosition = event.type === Event.PlaybackError && isNativeRadioContentTrack(active)
          ? (await TrackPlayer.getProgress()).position : 0;
        if (!valid()) return;
        await prepareTrack(catalog, track, { autoPlay: pendingPlay.current, forceRefresh: true, position: resumePosition });
      })().catch(async (error) => {
        if (request !== generation.current) return;
        pendingPlay.current = false;
        await releaseRadioLease();
        reportRadioFailure(error, generation.current, 'operation');
        setSourceState({ loading: false, error: radioErrorMessage(error) });
      });
      recovery.current = task;
      void task.finally(() => { if (recovery.current === task) recovery.current = undefined; });
      return;
    }
    const native = event.track;
    if (isNativeRadioIntervalTrack(native)) {
      if (native.radioGeneration !== generation.current || native.radioSourceTrackId !== stateRef.current.trackId) return;
      setWaitingForNext(true);
      setSourceState({ loading: false });
      return;
    }
    if (!isNativeRadioContentTrack(native) || native.radioGeneration !== generation.current) return;
    activeNativeContentTrack.current = native;
    if (queuedNextTrackId.current === native.radioTrackId) queuedNextTrackId.current = undefined;
    setWaitingForNext(false);
    const { catalog, track } = findTrack(stateRef.current.catalogs, native.radioBankId, native.radioTrackId);
    if (!catalog || !track) return;
    const changed = native.radioTrackId !== stateRef.current.trackId;
    preparedTrackId.current = track.id;
    setSourceState({ loading: false });
    if (changed) {
      for (const key of recoveryAttempts.current.keys()) if (key !== `${track.bankId}:${track.id}`) recoveryAttempts.current.delete(key);
      const nextShuffle = selectShuffleTrack(stateRef.current.shuffle, track.id);
      stateRef.current = { ...stateRef.current, bankId: catalog.bankId, trackId: track.id, shuffle: nextShuffle, position: 0 };
      nativeTransitionTrackId.current = track.id;
      setBankId(catalog.bankId);
      setTrackId(track.id);
      setBankTrackIds((value) => ({ ...value, [catalog.bankId]: track.id }));
      setShuffle(nextShuffle);
    }
    void hydrateTrackTopic(track).then((hydrated) => {
      if (activeNativeContentTrack.current?.id !== native.id) return;
      return appendUpcoming(hydrated.catalog ?? catalog, hydrated.track ?? track, false, native);
    }).catch(() => undefined);
  };
  useEffect(() => {
    setRadioPlaybackHandler((event) => playbackEvent.current(event));
    return () => setRadioPlaybackHandler(undefined);
  }, []);

  const play = useCallback(async () => {
    if (interrupted.current) return;
    const current = stateRef.current;
    const { catalog, track } = findTrack(current.catalogs, current.bankId, current.trackId);
    if (!catalog || !track) return;
    setSessionVisible(true);
    pendingPlay.current = true;
    const request = generation.current;
    try {
      const hydrated = await withRadioTimeout(hydrateTrackTopic(track));
      if (request !== generation.current || !pendingPlay.current) return;
      recoveryAttempts.current.delete(`${track.bankId}:${track.id}`);
      const nativeProgress = preparedTrackId.current === track.id ? await TrackPlayer.getProgress() : undefined;
      if (request !== generation.current || !pendingPlay.current) return;
      const resumePosition = waitingForNextRef.current || playback.state === State.Ended ? 0 : nativeProgress?.position ?? current.position;
      await prepareTrack(hydrated.catalog ?? catalog, hydrated.track ?? track, { autoPlay: true, position: resumePosition });
    } catch (error) {
      if (request !== generation.current) return;
      pendingPlay.current = false;
      reportRadioFailure(error, generation.current, 'operation');
      setSourceState({ loading: false, error: radioErrorMessage(error) });
    }
  }, [hydrateTrackTopic, playback.state, prepareTrack]);

  const pause = useCallback(() => {
    pendingPlay.current = false;
    if (interrupted.current) interrupted.current.resume = false;
    setSourceState((value) => ({ ...value, loading: false }));
    const lease = audioLease.current;
    void mutateRadioPlayer(() => !pendingPlay.current, () => TrackPlayer.pause()).then(() => releaseRadioLease(lease)).catch(() => undefined);
    void saveSnapshot();
  }, [releaseRadioLease, saveSnapshot]);

  const chooseTrack = useCallback((nextTrackId: string, autoPlay = true) => {
    const current = stateRef.current;
    const { catalog, track } = findTrack(current.catalogs, current.bankId, nextTrackId);
    if (!catalog || !track) return;
    const request = ++generation.current;
    queueRevision.current += 1;
    pendingPlay.current = autoPlay && !interrupted.current;
    recoveryAttempts.current.clear();
    stateRef.current.trackId = track.id;
    stateRef.current.position = 0;
    setWaitingForNext(false);
    requestedTrackId.current = track.id;
    setTrackId(track.id);
    setBankTrackIds((value) => ({ ...value, [catalog.bankId]: track.id }));
    const nextShuffle = selectShuffleTrack(stateRef.current.shuffle, track.id);
    stateRef.current.shuffle = nextShuffle;
    setShuffle(nextShuffle);
    setSourceState({ loading: true });
    if (autoPlay) setSessionVisible(true);
    void mutateRadioPlayer(() => request === generation.current, () => TrackPlayer.pause()).catch(() => undefined);
    void withRadioTimeout(hydrateTrackTopic(track)).then((hydrated) => {
      if (request !== generation.current) return;
      return prepareTrack(hydrated.catalog ?? catalog, hydrated.track ?? track, { autoPlay: pendingPlay.current });
    }).catch((error) => {
      if (request !== generation.current) return;
      pendingPlay.current = false;
      reportRadioFailure(error, generation.current, 'operation');
      setSourceState({ loading: false, error: radioErrorMessage(error) });
    });
  }, [hydrateTrackTopic, prepareTrack, setWaitingForNext]);

  const next = useCallback(async (autoPlay = true) => {
    const current = stateRef.current;
    const { catalog, track } = findTrack(current.catalogs, current.bankId, current.trackId);
    if (!catalog || !track) return;
    const request = generation.current;
    try {
      // The prepared native successor is authoritative for a random forward step.
      const prepared = queuedNextTrackId.current && current.mode !== 'repeatOne'
        ? catalog.tracks.find((item) => item.id === queuedNextTrackId.current) : undefined;
      const upcoming = prepared ?? await chooseUpcoming(catalog, track, current.mode === 'repeatOne' ? 'order' : current.mode, current.shuffle);
      if (request !== generation.current || !upcoming) return;
      chooseTrack(upcoming.id, autoPlay);
    } catch (error) {
      if (request !== generation.current) return;
      reportRadioFailure(error, generation.current, 'operation');
      setSourceState({ loading: false, error: radioErrorMessage(error) });
    }
  }, [chooseTrack, chooseUpcoming]);

  const previous = useCallback(async () => {
    const current = stateRef.current;
    const { catalog, track } = findTrack(current.catalogs, current.bankId, current.trackId);
    if (!catalog || !track) return;
    const result = previousTrack(catalog.tracks, track.id, current.mode, current.shuffle);
    if (!result.trackId) return;
    stateRef.current.shuffle = result.shuffle;
    setShuffle(result.shuffle);
    chooseTrack(result.trackId, true);
  }, [chooseTrack]);

  const seek = useCallback(async (position: number) => {
    if (waitingForNextRef.current) return;
    const request = generation.current;
    await mutateRadioPlayer(() => request === generation.current, () => TrackPlayer.seekTo(Math.max(0, Math.min(duration, position))));
  }, [duration]);

  const stopAndClear = useCallback(() => {
    generation.current += 1;
    queueRevision.current += 1;
    requestedTrackId.current = undefined;
    pendingPlay.current = false;
    preparedTrackId.current = undefined;
    queuedNextTrackId.current = undefined;
    activeNativeContentTrack.current = undefined;
    setWaitingForNext(false);
    const lease = audioLease.current;
    void mutateRadioPlayer(() => !pendingPlay.current, () => TrackPlayer.reset()).then(() => releaseRadioLease(lease)).catch(() => {
      setSourceState({ loading: false, error: '音频停止失败，请稍后重试' });
    });
    setSourceState({ loading: false });
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

  const replacePreparedUpcoming = useCallback(async (
    catalog: RadioCatalog,
    track: RadioTrack,
    _nextMode: RadioPlaybackMode,
    _nextInterval: number,
  ) => {
    const request = generation.current;
    const revision = ++queueRevision.current;
    const valid = () => request === generation.current && revision === queueRevision.current;
    await mutateRadioPlayer(valid, async () => {
      await TrackPlayer.removeUpcomingTracks();
      queuedNextTrackId.current = undefined;
    });
    if (!valid()) return;
    await appendUpcoming(catalog, track, false, activeNativeContentTrack.current);
  }, [appendUpcoming]);

  const setMode = useCallback((nextMode: RadioPlaybackMode) => {
    stateRef.current.mode = nextMode;
    setModeState(nextMode);
    const current = stateRef.current;
    const { catalog, track } = findTrack(current.catalogs, current.bankId, current.trackId);
    if (!catalog || !track) return;
    void replacePreparedUpcoming(catalog, track, nextMode, current.intervalSeconds).catch(() => undefined);
  }, [replacePreparedUpcoming]);

  const setRate = useCallback((nextRate: number) => {
    stateRef.current.rate = nextRate;
    setRadioContentPlaybackRate(nextRate);
    setRateState(nextRate);
    if (!waitingForNextRef.current) {
      const request = generation.current;
      void mutateRadioPlayer(() => request === generation.current && stateRef.current.rate === nextRate, () => TrackPlayer.setRate(nextRate)).catch(() => undefined);
    }
  }, []);

  const setIntervalSeconds = useCallback((nextValue: number) => {
    const nextInterval = clampRadioInterval(nextValue);
    if (nextInterval === stateRef.current.intervalSeconds) return;
    stateRef.current.intervalSeconds = nextInterval;
    setIntervalSecondsState(nextInterval);
    queueRevision.current += 1;
    const request = generation.current;
    const valid = () => request === generation.current && stateRef.current.intervalSeconds === nextInterval;
    void (async () => {
      const current = stateRef.current;
      const { catalog, track } = findTrack(current.catalogs, current.bankId, current.trackId);
      if (!catalog || !track) return;
      const active = await TrackPlayer.getActiveTrack();
      if (!valid()) return;
      if (isNativeRadioIntervalTrack(active) && nextInterval === 0) {
        const queued = queuedNextTrackId.current;
        const upcoming = current.mode === 'repeatOne' ? track
          : (queued && catalog.tracks.find((item) => item.id === queued))
            || await chooseUpcoming(catalog, track, current.mode, current.shuffle);
        const stillActive = await TrackPlayer.getActiveTrack();
        if (!valid() || !upcoming || stillActive?.id !== active.id) return;
        // Select content, never set native repeat on the active silence or skip an already-started successor.
        chooseTrack(upcoming.id, pendingPlay.current);
        await saveSnapshot();
        return;
      }
      if (isNativeRadioIntervalTrack(active) && nextInterval > 0 && activeNativeContentTrack.current) {
        await ensureRadioIntervalSilenceAsset(nextInterval);
        await mutateRadioPlayer(valid, async () => {
          const stillActive = await TrackPlayer.getActiveTrack();
          if (stillActive?.id !== active.id) return;
          await TrackPlayer.removeUpcomingTracks();
          await TrackPlayer.add(createNativeRadioIntervalTrack(activeNativeContentTrack.current!, nextInterval, ++nativeTrackInstance.current));
          await TrackPlayer.skipToNext(0);
        });
      }
      if (!valid()) return;
      const latest = stateRef.current;
      const selected = findTrack(latest.catalogs, latest.bankId, latest.trackId);
      if (selected.catalog && selected.track) await replacePreparedUpcoming(selected.catalog, selected.track, latest.mode, nextInterval);
      await saveSnapshot();
    })().catch((error) => {
      if (!valid()) return;
      reportRadioFailure(error, generation.current, 'operation');
      setSourceState({ loading: false, error: radioErrorMessage(error) });
    });
  }, [chooseTrack, chooseUpcoming, replacePreparedUpcoming, saveSnapshot]);

  const activateSession = useCallback(() => {
    setSessionVisible(true);
    const current = stateRef.current;
    const selected = findTrack(current.catalogs, current.bankId, current.trackId).track;
    if (selected) void hydrateTrackTopic(selected).catch((error) => {
      setSourceState({ loading: false, error: radioErrorMessage(error) });
    });
  }, [hydrateTrackTopic]);

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
    loading: sourceState.loading || catalogLoading,
    buffering,
    error: catalogError ?? sourceState.error,
    position,
    duration,
    sessionVisible,
    activateSession,
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
      stateRef.current.bankId = nextBankId;
      stateRef.current.shuffle = { history: [nextId], cursor: 0 };
      setBankId(nextBankId);
      chooseTrack(nextId, false);
    },
    selectTrack: chooseTrack,
    setMode,
    setSubtitleMode: setSubtitleModeState,
    setRate,
    setIntervalSeconds,
    retry: () => {
      if (catalogError) { setCatalogRetry((value) => value + 1); return; }
      recoveryAttempts.current.clear();
      if (currentCatalog && currentTrack) void prepareTrack(currentCatalog, currentTrack, { autoPlay: true, forceRefresh: true, position });
    },
    stopAndClear,
  }), [activateSession, bankTrackIds, buffering, catalogError, catalogLoading, catalogs, chooseTrack, currentCatalog, currentIndex, currentTrack, duration, intervalRemaining, intervalSeconds, mode, next, pause, play, playing, position, prepareTrack, previous, rate, seek, sessionVisible, setIntervalSeconds, setMode, setRate, sourceState.error, sourceState.loading, stopAndClear, subtitleMode, waitingForNext]);

  return <RadioContext.Provider value={value}>{children}</RadioContext.Provider>;
}

export function useRadioPlayer() {
  const value = useContext(RadioContext);
  if (!value) throw new Error('useRadioPlayer must be used inside RadioPlayerProvider');
  return value;
}
