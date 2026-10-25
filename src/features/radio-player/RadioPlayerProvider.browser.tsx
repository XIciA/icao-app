import { normalizeStudyScope } from '@icao/contracts';
import { useProfile } from '@/features/account/profile-store.native';
import { useBrowserAudioPlayer } from '@/platform/audio/browser-audio-player';
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type PropsWithChildren } from 'react';
import { AppState } from 'react-native';

import { resolveQuestionBankAsset, resolveRemoteQuestionBankAsset } from '@/features/question-bank/platform/resource-service';
import { useAuth } from '@/features/auth/AuthProvider';
import { audioSessionOrchestrator, type AudioLease } from '@/platform/audio';
import Storage from '@/platform/storage';
import { isEdgeOneProductionWeb } from '@/config/web-runtime';
import { commerceContentAccessSnapshot, getCommerceEntitlementSnapshot, subscribeCommerceEntitlementChanges } from '@/features/native-commercial-testflight/commerce-entitlement-events';

import { getEmbeddedRadioCatalogs, loadRadioCatalogs } from './catalog.browser';
import { nextManualTrack, nextTrack, previousTrack, selectShuffleTrack, type ShuffleState } from './queue';
import { clampRadioInterval } from './radio-interval';
import type { RadioBankId, RadioCatalog, RadioPlaybackMode, RadioPlayerContextValue, RadioSubtitleMode, RadioTrack } from './types';

const STORAGE_KEY = 'icao.radio-player.v1';
const speedOptions = [0.75, 1, 1.25, 1.5] as const;
const RadioContext = createContext<RadioPlayerContextValue | undefined>(undefined);

type Snapshot = {
  schemaVersion: 2;
  bankId: RadioBankId;
  trackId: string;
  position: number;
  mode: RadioPlaybackMode;
  subtitleMode: RadioSubtitleMode;
  rate: number;
  intervalSeconds: number;
  bankTrackIds: Partial<Record<RadioBankId, string>>;
};

function findTrack(catalogs: RadioCatalog[], bankId: RadioBankId, trackId: string) {
  const catalog = catalogs.find((item) => item.bankId === bankId) ?? catalogs[0];
  const track = catalog?.tracks.find((item) => item.id === trackId) ?? catalog?.tracks[0];
  return { catalog, track };
}

export function RadioPlayerProvider({ children }: PropsWithChildren) {
  const auth = useAuth();
  const entitlementRevision = useSyncExternalStore(subscribeCommerceEntitlementChanges, commerceContentAccessSnapshot, commerceContentAccessSnapshot);
  const [catalogAttempt, setCatalogAttempt] = useState(0);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState<string>();
  const profile = useProfile();
  const selection = useMemo(() => ({ scope: normalizeStudyScope(profile.studyScope), target: profile.target }), [profile.studyScope, profile.target]);
  const embeddedCatalogs = useMemo(() => getEmbeddedRadioCatalogs(selection), [selection]);
  const formalWeb = isEdgeOneProductionWeb();
  const signedIn = Boolean(auth.session);
  const entitlement = getCommerceEntitlementSnapshot();
  const contentOwner = formalWeb
    ? `${auth.session?.user.id ?? 'signed-out'}:${auth.account?.accountId ?? 'none'}:${entitlement?.generation ?? 0}:${entitlement?.snapshot?.membership.active === true}:${selection.scope}:${selection.target}`
    : 'legacy';
  const contentOwnerRef = useRef(contentOwner); contentOwnerRef.current = contentOwner;
  const [loadedCatalogs, setLoadedCatalogs] = useState({ owner: contentOwner, catalogs: embeddedCatalogs });
  // Fail closed during render; an effect alone would expose the old owner's
  // protected transcript for one frame while a new account is loading/offline.
  const catalogs = loadedCatalogs.owner === contentOwner ? loadedCatalogs.catalogs : embeddedCatalogs;
  const [bankId, setBankId] = useState<RadioBankId>(embeddedCatalogs[0]?.bankId ?? 'listening');
  const [trackId, setTrackId] = useState(embeddedCatalogs[0]?.tracks[0]?.id ?? '');
  const [bankTrackIds, setBankTrackIds] = useState<Partial<Record<RadioBankId, string>>>({});
  const [mode, setModeState] = useState<RadioPlaybackMode>('order');
  const [subtitleMode, setSubtitleMode] = useState<RadioSubtitleMode>('off');
  const [rate, setRateState] = useState(1);
  const [intervalSeconds, setIntervalSecondsState] = useState(0);
  const [intervalRemaining, setIntervalRemaining] = useState(0);
  const [waitingForNext, setWaitingForNext] = useState(false);
  const [sessionVisible, setSessionVisible] = useState(false);
  const [sourceState, setSourceState] = useState<{ loading: boolean; error?: string }>({ loading: false });
  const [restored, setRestored] = useState(false);
  const [shuffle, setShuffle] = useState<ShuffleState>({ history: trackId ? [trackId] : [], cursor: trackId ? 0 : -1 });
  const player = useBrowserAudioPlayer();
  const status = player.currentStatus;
  const generation = useRef(0);
  const preparedTrackId = useRef<string | undefined>(undefined);
  const loadingTrackId = useRef<string | undefined>(undefined);
  const installedTrackId = useRef<string | undefined>(undefined);
  const pendingPlay = useRef(false);
  const pendingSeek = useRef(0);
  const handledFinish = useRef(false);
  const audioLease = useRef<AudioLease | undefined>(undefined);
  const intervalTimer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const stateRef = useRef({ bankId, trackId, bankTrackIds, catalogs, intervalSeconds, mode, subtitleMode, rate, shuffle, position: 0 });

  const { catalog: currentCatalog, track: currentTrack } = findTrack(catalogs, bankId, trackId);
  const currentIndex = currentTrack ? currentCatalog?.tracks.findIndex((track) => track.id === currentTrack.id) ?? -1 : -1;
  const sourceMatches = Boolean(currentTrack && installedTrackId.current === currentTrack.id);
  const duration = (sourceMatches ? status.duration : 0) || currentTrack?.durationSeconds || 0;
  const position = sourceMatches ? status.currentTime || 0 : 0;
  const playing = sourceMatches && status.playing;
  const buffering = sourceMatches && (status.isBuffering || status.timeControlStatus === 'waiting');
  stateRef.current = { bankId, trackId, bankTrackIds, catalogs, intervalSeconds, mode, subtitleMode, rate, shuffle, position };

  const releaseLease = useCallback(async (lease = audioLease.current) => {
    if (lease) await audioSessionOrchestrator.release(lease).catch(() => undefined);
    if (audioLease.current?.token === lease?.token) audioLease.current = undefined;
  }, []);

  const clearIntervalTimer = useCallback(() => {
    if (intervalTimer.current) clearInterval(intervalTimer.current);
    intervalTimer.current = undefined;
    setWaitingForNext(false);
    setIntervalRemaining(0);
  }, []);

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

  const resolveTrack = useCallback(async (track: RadioTrack, forceRefresh = false) => {
    const remote = await resolveRemoteQuestionBankAsset(track.audioPath, { forceRefresh }).catch(() => undefined);
    const uri = remote ?? resolveQuestionBankAsset(track.audioPath);
    if (!uri) throw new Error('resource_unavailable');
    return uri;
  }, []);

  const prepareTrack = useCallback(async (track: RadioTrack, { autoPlay, forceRefresh = false, position: nextPosition = 0 }: { autoPlay: boolean; forceRefresh?: boolean; position?: number }) => {
    const request = generation.current + 1;
    const owner = contentOwnerRef.current;
    generation.current = request;
    pendingPlay.current = autoPlay;
    pendingSeek.current = Math.max(0, nextPosition);
    preparedTrackId.current = undefined;
    loadingTrackId.current = track.id;
    installedTrackId.current = undefined;
    handledFinish.current = false;
    clearIntervalTimer();
    setSourceState({ loading: true });
    try {
      player.pause();
      await releaseLease();
      if (request !== generation.current || owner !== contentOwnerRef.current) return;
      const uri = await resolveTrack(track, forceRefresh);
      if (request !== generation.current || owner !== contentOwnerRef.current) return;
      player.replace(uri);
      installedTrackId.current = track.id;
      setSourceState({ loading: true });
    } catch {
      if (request !== generation.current || owner !== contentOwnerRef.current) return;
      loadingTrackId.current = undefined;
      pendingPlay.current = false;
      setSourceState({ loading: false, error: '音频加载失败，请重试或切换下一首' });
    }
  }, [clearIntervalTimer, player, releaseLease, resolveTrack]);

  const startPreparedPlayback = useCallback(async () => {
    if (!currentTrack || preparedTrackId.current !== currentTrack.id || !status.isLoaded) return;
    let lease: AudioLease | undefined;
    const request = generation.current;
    const owner = contentOwnerRef.current;
    try {
      lease = await audioSessionOrchestrator.acquire('radio', 'web-radio-play');
      if (request !== generation.current || owner !== contentOwnerRef.current) { await releaseLease(lease); return; }
      audioLease.current = lease;
      if (status.didJustFinish || status.currentTime >= Math.max(0, status.duration - 0.1)) await player.seekTo(0);
      if (request !== generation.current || owner !== contentOwnerRef.current) { await releaseLease(lease); return; }
      player.setPlaybackRate(rate);
      await player.play();
      if (request !== generation.current || owner !== contentOwnerRef.current) { await releaseLease(lease); return; }
      setSessionVisible(true);
      setSourceState({ loading: false });
    } catch {
      if (lease) await releaseLease(lease);
      if (request !== generation.current || owner !== contentOwnerRef.current) return;
      setSourceState({ loading: false, error: '音频播放失败，请重试或切换下一首' });
    }
  }, [currentTrack, player, rate, releaseLease, status.currentTime, status.didJustFinish, status.duration, status.isLoaded]);

  const chooseTrack = useCallback((nextTrackId: string, autoPlay = true) => {
    const current = stateRef.current;
    const { catalog, track } = findTrack(current.catalogs, current.bankId, nextTrackId);
    if (!catalog || !track) return;
    setTrackId(track.id);
    setBankTrackIds((value) => ({ ...value, [catalog.bankId]: track.id }));
    setShuffle((value) => selectShuffleTrack(value, track.id));
    if (autoPlay) setSessionVisible(true);
    void prepareTrack(track, { autoPlay });
  }, [prepareTrack]);

  const next = useCallback(async (autoPlay = true) => {
    const current = stateRef.current;
    const { catalog, track } = findTrack(current.catalogs, current.bankId, current.trackId);
    if (!catalog || !track) return;
    const result = nextManualTrack(catalog.tracks, track.id, current.mode, current.shuffle);
    if (!result.trackId) return;
    setShuffle(result.shuffle);
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

  const advanceAutomatically = useCallback(() => {
    const current = stateRef.current;
    const { catalog, track } = findTrack(current.catalogs, current.bankId, current.trackId);
    if (!catalog || !track) return;
    const result = nextTrack(catalog.tracks, track.id, current.mode, current.shuffle);
    if (!result.trackId) return;
    setShuffle(result.shuffle);
    chooseTrack(result.trackId, true);
  }, [chooseTrack]);

  useLayoutEffect(() => {
    if (!formalWeb) return;
    generation.current += 1;
    pendingPlay.current = false; pendingSeek.current = 0;
    preparedTrackId.current = undefined; loadingTrackId.current = undefined; installedTrackId.current = undefined;
    clearIntervalTimer(); player.pause(); player.replace(null);
    void releaseLease();
    setLoadedCatalogs({ owner: contentOwner, catalogs: embeddedCatalogs });
    setCatalogError(undefined); setCatalogLoading(false); setSourceState({ loading: false });
    if (!signedIn) setSessionVisible(false);
    setTrackId(embeddedCatalogs[0]?.tracks[0]?.id ?? ''); setBankTrackIds({});
    setShuffle({ history: [], cursor: -1 });
  }, [clearIntervalTimer, contentOwner, embeddedCatalogs, formalWeb, player, releaseLease, signedIn]);

  useEffect(() => {
    if (auth.restoring || !auth.session || !sessionVisible) return;
    let active = true;
    setCatalogError(undefined);
    setCatalogLoading(true);
    const publish = (nextCatalogs: RadioCatalog[]) => {
      if (active && contentOwnerRef.current === contentOwner && nextCatalogs.length) setLoadedCatalogs({ owner: contentOwner, catalogs: nextCatalogs });
    };
    void loadRadioCatalogs(selection, stateRef.current.bankId, () => active && contentOwnerRef.current === contentOwner, publish).then(publish).catch(() => { if (active && contentOwnerRef.current === contentOwner && formalWeb) setCatalogError('播放列表加载失败，请检查网络后重试'); }).finally(() => { if (active) setCatalogLoading(false); });
    return () => { active = false; };
  }, [auth.restoring, auth.session, sessionVisible, entitlementRevision, catalogAttempt, contentOwner, formalWeb, selection]);

  useEffect(() => {
    let active = true;
    void Storage.getItem(STORAGE_KEY).then((raw) => {
      if (!active || !raw) return;
      try {
        const value = JSON.parse(raw) as Snapshot;
        if (value.schemaVersion !== 2) return;
        const { catalog, track } = findTrack(embeddedCatalogs, value.bankId, value.trackId);
        if (!catalog || !track) return;
        setBankId(catalog.bankId);
        setTrackId(track.id);
        setBankTrackIds(value.bankTrackIds ?? {});
        setModeState(['order', 'repeatOne', 'shuffle'].includes(value.mode) ? value.mode : 'order');
        setSubtitleMode(['english', 'bilingual', 'off'].includes(value.subtitleMode) ? value.subtitleMode : 'off');
        setRateState(speedOptions.includes(value.rate as (typeof speedOptions)[number]) ? value.rate : 1);
        setIntervalSecondsState(clampRadioInterval(value.intervalSeconds));
        setShuffle({ history: [track.id], cursor: 0 });
        pendingSeek.current = Math.max(0, value.position || 0);
      } catch {
        // Invalid browser state falls back to the embedded catalog.
      }
    }).finally(() => { if (active) setRestored(true); });
    return () => { active = false; };
  }, [embeddedCatalogs]);

  useEffect(() => audioSessionOrchestrator.register('radio', {
    deactivate: async () => {
      generation.current += 1;
      pendingPlay.current = false;
      player.pause();
      audioLease.current = undefined;
      clearIntervalTimer();
    },
  }), [clearIntervalTimer, player]);

  useEffect(() => {
    if (!restored || !auth.session || !sessionVisible || !currentTrack || loadingTrackId.current === currentTrack.id || preparedTrackId.current === currentTrack.id) return;
    const restoredPosition = pendingSeek.current;
    void prepareTrack(currentTrack, { autoPlay: false, position: restoredPosition });
  }, [auth.session, currentTrack, prepareTrack, restored, sessionVisible]);

  useEffect(() => {
    if (!currentTrack || !sourceMatches || loadingTrackId.current !== currentTrack.id || !status.isLoaded) return;
    loadingTrackId.current = undefined;
    preparedTrackId.current = currentTrack.id;
    setSourceState({ loading: false });
    player.setPlaybackRate(rate);
    const seek = Math.min(pendingSeek.current, Math.max(0, (status.duration || currentTrack.durationSeconds) - 0.25));
    pendingSeek.current = 0;
    const request = generation.current;
    const finish = async () => {
      if (seek > 0) await player.seekTo(seek);
      if (request !== generation.current) return;
      if (pendingPlay.current) await startPreparedPlayback();
    };
    void finish();
  }, [currentTrack, player, rate, sourceMatches, startPreparedPlayback, status.duration, status.isLoaded]);

  useEffect(() => {
    if (!sourceState.loading) return;
    const timeout = setTimeout(() => {
      if (loadingTrackId.current) {
        loadingTrackId.current = undefined;
        pendingPlay.current = false;
        setSourceState({ loading: false, error: '音频加载超时，请重试' });
      }
    }, 8_000);
    return () => clearTimeout(timeout);
  }, [sourceState.loading]);

  useEffect(() => {
    if (status.playbackState !== 'error') return;
    pendingPlay.current = false;
    void releaseLease();
    setSourceState({ loading: false, error: '音频播放失败，请重试或切换下一首' });
  }, [releaseLease, status.playbackState]);

  useEffect(() => {
    if (!auth.session || !sourceMatches || !status.didJustFinish || handledFinish.current || preparedTrackId.current !== currentTrack?.id) return;
    handledFinish.current = true;
    void releaseLease();
    if (intervalSeconds <= 0) {
      advanceAutomatically();
      return;
    }
    setWaitingForNext(true);
    setIntervalRemaining(intervalSeconds);
    intervalTimer.current = setInterval(() => {
      setIntervalRemaining((remaining) => {
        if (remaining > 1) return remaining - 1;
        clearIntervalTimer();
        advanceAutomatically();
        return 0;
      });
    }, 1_000);
  }, [advanceAutomatically, auth.session, clearIntervalTimer, currentTrack?.id, intervalSeconds, releaseLease, sourceMatches, status.didJustFinish]);

  useEffect(() => {
    const timer = setInterval(() => { if (sessionVisible) void saveSnapshot(); }, 2_000);
    const subscription = AppState.addEventListener('change', (nextState) => { if (nextState !== 'active') void saveSnapshot(); });
    return () => { clearInterval(timer); subscription.remove(); };
  }, [saveSnapshot, sessionVisible]);

  useEffect(() => () => {
    generation.current += 1;
    clearIntervalTimer();
    player.pause();
    void releaseLease();
  }, [clearIntervalTimer, player, releaseLease]);

  const play = useCallback(async () => {
    if (!currentTrack) return;
    pendingPlay.current = true;
    clearIntervalTimer();
    if (preparedTrackId.current !== currentTrack.id || !status.isLoaded) {
      await prepareTrack(currentTrack, { autoPlay: true, position });
      return;
    }
    await startPreparedPlayback();
  }, [clearIntervalTimer, currentTrack, position, prepareTrack, startPreparedPlayback, status.isLoaded]);

  const pause = useCallback(() => {
    pendingPlay.current = false;
    player.pause();
    void releaseLease();
    void saveSnapshot();
  }, [player, releaseLease, saveSnapshot]);

  const seek = useCallback(async (nextPosition: number) => {
    if (waitingForNext) return;
    await player.seekTo(Math.max(0, Math.min(duration, nextPosition)));
  }, [duration, player, waitingForNext]);

  const setRate = useCallback((nextRate: number) => {
    setRateState(nextRate);
    stateRef.current.rate = nextRate;
    player.setPlaybackRate(nextRate);
  }, [player]);

  const setIntervalSeconds = useCallback((value: number) => {
    const nextInterval = clampRadioInterval(value);
    setIntervalSecondsState(nextInterval);
    stateRef.current.intervalSeconds = nextInterval;
    if (waitingForNext && nextInterval === 0) {
      clearIntervalTimer();
      advanceAutomatically();
    }
  }, [advanceAutomatically, clearIntervalTimer, waitingForNext]);

  const stopAndClear = useCallback(() => {
    generation.current += 1;
    pendingPlay.current = false;
    preparedTrackId.current = undefined;
    loadingTrackId.current = undefined;
    installedTrackId.current = undefined;
    clearIntervalTimer();
    player.pause();
    player.replace(null);
    void releaseLease();
    setSessionVisible(false);
    setSourceState({ loading: false });
  }, [clearIntervalTimer, player, releaseLease]);

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
    catalogLoading,
    catalogError,
    retryCatalog: () => setCatalogAttempt(value => value + 1),
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
      const savedId = bankTrackIds[nextBankId];
      const nextId = savedId && catalog?.tracks.some((track) => track.id === savedId) ? savedId : catalog?.tracks[0]?.id;
      const track = catalog?.tracks.find((item) => item.id === nextId);
      if (!catalog) return;
      if (!track || (savedId && !catalog.tracks.some(track => track.id === savedId))) {
        stopAndClear();
        setSessionVisible(true);
        setBankId(catalog.bankId);
        setTrackId(savedId ?? '');
        return;
      }
      pendingPlay.current = false;
      setBankId(catalog.bankId);
      setTrackId(track.id);
      setShuffle({ history: [track.id], cursor: 0 });
      void prepareTrack(track, { autoPlay: false });
    },
    selectTrack: chooseTrack,
    setMode: (nextMode) => {
      stateRef.current.mode = nextMode;
      setModeState(nextMode);
    },
    setSubtitleMode,
    setRate,
    setIntervalSeconds,
    retry: () => {
      if (currentTrack) void prepareTrack(currentTrack, { autoPlay: true, forceRefresh: true, position });
    },
    stopAndClear,
  }), [bankTrackIds, buffering, catalogError, catalogLoading, catalogs, chooseTrack, currentCatalog, currentIndex, currentTrack, duration, intervalRemaining, intervalSeconds, mode, next, pause, play, playing, position, prepareTrack, previous, rate, seek, sessionVisible, setIntervalSeconds, setRate, sourceState.error, sourceState.loading, stopAndClear, subtitleMode, waitingForNext]);

  return <RadioContext.Provider value={value}>{children}</RadioContext.Provider>;
}

export function useRadioPlayer() {
  const value = useContext(RadioContext);
  if (!value) throw new Error('useRadioPlayer must be used inside RadioPlayerProvider');
  return value;
}
