import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { audioSessionOrchestrator, emitAudioDiagnostic, type AudioLease } from '@/platform/audio';

import { recordingRepository } from './recording-repository';
import type { RecordingAsset } from './types';

const LOAD_TIMEOUT_MS = 4_000;

export type RecordingPlaybackError = 'asset_missing' | 'playback_load_failed' | 'playback_start_failed';

export function useRecordingPlayback(asset?: RecordingAsset, pauseRequest = 0) {
  const player = useAudioPlayer(null, { updateInterval: 100 });
  const status = useAudioPlayerStatus(player);
  const [error, setError] = useState<RecordingPlaybackError>();
  const [retryToken, setRetryToken] = useState(0);
  const leaseRef = useRef<AudioLease | undefined>(undefined);
  const resumeAfterScrub = useRef(false);
  const operationGeneration = useRef(0);
  const appStateRef = useRef(AppState.currentState || 'active');

  const tryPausePlayer = useCallback(() => {
    try {
      player.pause();
      return true;
    } catch {
      return false;
    }
  }, [player]);

  const trySeekPlayer = useCallback(async (position: number) => {
    try {
      await player.seekTo(position);
      return true;
    } catch {
      return false;
    }
  }, [player]);

  const releaseLease = useCallback(async (lease = leaseRef.current) => {
    if (lease) await audioSessionOrchestrator.release(lease).catch(() => undefined);
    if (leaseRef.current?.token === lease?.token) leaseRef.current = undefined;
  }, []);

  const pause = useCallback(() => {
    operationGeneration.current += 1;
    const lease = leaseRef.current;
    tryPausePlayer();
    resumeAfterScrub.current = false;
    void releaseLease(lease);
  }, [releaseLease, tryPausePlayer]);

  useEffect(() => audioSessionOrchestrator.register('recordingPlayback', {
    deactivate: async () => {
      operationGeneration.current += 1;
      if (!tryPausePlayer()) throw new Error('recording_playback_pause_failed');
      leaseRef.current = undefined;
    },
  }), [tryPausePlayer]);

  useEffect(() => {
    pause();
    setError(undefined);
    if (!asset) {
      try {
        player.remove();
      } catch {
        // The player may already be empty or released; there is no asset to invalidate.
      }
      return;
    }
    try {
      player.replace(asset.uri);
    } catch {
      setError(!recordingRepository.assetExists(asset) ? 'asset_missing' : 'playback_load_failed');
    }
  }, [asset, pause, player, retryToken]);

  useEffect(() => {
    if (!asset || status.isLoaded) return;
    const timeout = setTimeout(() => {
      const next = recordingRepository.assetExists(asset) ? 'playback_load_failed' : 'asset_missing';
      setError(next);
      emitAudioDiagnostic({ code: next, level: 'error', phase: 'loading', scope: 'playback' });
    }, LOAD_TIMEOUT_MS);
    return () => clearTimeout(timeout);
  }, [asset, retryToken, status.isLoaded]);

  useEffect(() => {
    if (!asset || status.playbackState !== 'error') return;
    pause();
    const next = recordingRepository.assetExists(asset) ? 'playback_load_failed' : 'asset_missing';
    setError(next);
    emitAudioDiagnostic({ code: next, level: 'error', phase: 'loading', scope: 'playback' });
  }, [asset, pause, status.playbackState]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      appStateRef.current = next;
      if (next !== 'active') pause();
    });
    return () => subscription.remove();
  }, [pause]);

  useEffect(() => {
    if (!status.didJustFinish) return;
    operationGeneration.current += 1;
    emitAudioDiagnostic({ code: 'playback_completed', level: 'info', phase: 'ready', scope: 'playback' });
    void releaseLease();
  }, [releaseLease, status.didJustFinish]);

  useEffect(() => {
    if (pauseRequest > 0) pause();
  }, [pause, pauseRequest]);

  useEffect(() => () => pause(), [pause]);

  const play = useCallback(async () => {
    if (!asset || error === 'asset_missing') return false;
    if (!status.isLoaded) {
      setError('playback_load_failed');
      return false;
    }
    const generation = operationGeneration.current + 1;
    operationGeneration.current = generation;
    let lease: AudioLease | undefined;
    try {
      lease = await audioSessionOrchestrator.acquire('recordingPlayback', 'recording-preview');
      if (generation !== operationGeneration.current || appStateRef.current !== 'active') {
        await releaseLease(lease);
        return false;
      }
      leaseRef.current = lease;
      if ((status.didJustFinish || status.currentTime >= status.duration) && !await trySeekPlayer(0)) {
        throw new Error('recording_playback_seek_failed');
      }
      player.play();
      setError(undefined);
      emitAudioDiagnostic({ code: 'playback_started', level: 'info', phase: 'playing', scope: 'playback' });
      return true;
    } catch {
      if (lease) await releaseLease(lease);
      setError('playback_start_failed');
      emitAudioDiagnostic({ code: 'playback_start_failed', level: 'error', phase: 'ready', scope: 'playback' });
      return false;
    }
  }, [asset, error, player, releaseLease, status.currentTime, status.didJustFinish, status.duration, status.isLoaded, trySeekPlayer]);

  return {
    beginScrub() {
      resumeAfterScrub.current = status.playing;
      if (status.playing) tryPausePlayer();
    },
    cancelScrub(onResume?: () => void) {
      const shouldResume = resumeAfterScrub.current;
      resumeAfterScrub.current = false;
      if (!shouldResume || appStateRef.current !== 'active') return;
      void play().then((started) => { if (started) onResume?.(); });
    },
    error,
    async finishScrub(position: number, onResume?: () => void) {
      const shouldResume = resumeAfterScrub.current;
      resumeAfterScrub.current = false;
      if (!await trySeekPlayer(position)) {
        await releaseLease();
        setError('playback_start_failed');
        return;
      }
      if (!shouldResume || appStateRef.current !== 'active') return;
      const started = await play();
      if (started) onResume?.();
    },
    pause,
    play,
    retry: () => setRetryToken((current) => current + 1),
    status,
  };
}
