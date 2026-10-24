/* eslint-disable import/first */
import React from 'react';
import { Asset } from 'expo-asset';
import { act, render } from '@testing-library/react-native';
import type { RadioPlayerContextValue } from '../types';
import { RadioOperationCoordinator } from '../operation-coordinator';

const mockTracks = Array.from({ length: 6 }, (_, i) => ({ id: `t${i}`, bankId: 'listening', bankTitle: '听力', categoryId: 'c', categoryTitle: 'C', topicId: 'topic', topicTitle: 'T', title: `T${i}`, audioText: '', audioPath: `/audio/${i}.mp3`, durationSeconds: 20, stableIndex: i }));
const mockCatalogs = [{ bankId: 'listening', title: '听力', nameEn: 'Listening', tracks: mockTracks }];
const mockSession = { user: { id: 'user-a' } };
let mockProfile = { studyScope: 'all', target: 'icao4-first' };
const mockSelectionCatalogs = (selection?: { scope: string }) => selection?.scope === 'crash'
  ? [{ ...mockCatalogs[0], tracks: mockTracks.slice(0, 2) }] : mockCatalogs;
let mockQueue: any[] = [];
let mockActive = 0;
let mockPlaybackHandler: ((event: any) => void) | undefined;
let mockContext: RadioPlayerContextValue;
let mockDeactivate: () => Promise<void>;
const mockResolve = jest.fn(async (path: string) => `file://${path}`);
const mockPlay = jest.fn(async () => undefined);
const mockPause = jest.fn(async () => undefined);
const mockAcquire = jest.fn(async () => ({ token: 'lease' }));
const mockCoordinator = new RadioOperationCoordinator();
const mockLoadCatalogs = jest.fn(async (_selection?: unknown, _options?: { complete?: boolean }) => []);

jest.mock('@/features/auth/AuthProvider', () => ({ useAuth: () => ({ restoring: false, session: mockSession }) }));
jest.mock('@/features/account/profile-store.native', () => ({ useProfile: () => mockProfile }));
jest.mock('@/features/native-commercial-testflight/commerce-environment', () => ({ nativeCommerceEnvironmentSnapshot: () => 'production', subscribeNativeCommerceEnvironment: () => () => undefined }));
jest.mock('@/features/question-bank/data/repository.native', () => ({ getEmbeddedQuestionBanks: () => [] }));
jest.mock('@/features/question-bank/platform/resource-service', () => ({ resolveQuestionBankAsset: () => undefined, resolveRemoteQuestionBankAsset: (path: string) => mockResolve(path) }));
jest.mock('../catalog.native', () => ({ getEmbeddedRadioCatalogs: (selection: { scope: string }) => mockSelectionCatalogs(selection), loadRadioCatalogDatasets: (...args: Parameters<typeof mockLoadCatalogs>) => mockLoadCatalogs(...args), deriveRadioCatalogs: (_datasets: unknown, selection: { scope: string }) => mockSelectionCatalogs(selection) }));
jest.mock('../catalog-hydration.native', () => ({ hydrateRadioCatalogTopic: async (value: unknown) => value, nextRadioCatalogTopic: () => undefined }));
jest.mock('@/platform/audio', () => ({ audioSessionOrchestrator: { acquire: () => mockAcquire(), release: async () => undefined, register: (_owner: string, client: { deactivate: () => Promise<void> }) => { mockDeactivate = client.deactivate; return () => undefined; } } }));
jest.mock('../radio-player-storage', () => ({ activateRadioPlayerSession: async () => true, clearRadioPlayerAccountData: async () => undefined, readRadioPlayerSnapshot: async () => undefined, registerRadioPlayerRuntimeReset: () => () => undefined, saveRadioPlayerSnapshot: async () => undefined }));
jest.mock('../track-player-runtime', () => ({
  ensureRadioTrackPlayer: async () => undefined, setRadioContentPlaybackRate: () => undefined,
  setRadioRemoteHandlers: () => undefined,
  setRadioPlaybackHandler: (handler: typeof mockPlaybackHandler) => { mockPlaybackHandler = handler; },
  mutateRadioPlayer: (valid: () => boolean, fn: () => Promise<unknown>) => mockCoordinator.run(valid, fn),
}));
jest.mock('react-native-track-player', () => ({
  __esModule: true,
  default: {
    reset: async () => { mockQueue = []; mockActive = 0; },
    add: async (tracks: any) => { mockQueue.push(...(Array.isArray(tracks) ? tracks : [tracks])); },
    remove: async (indexes: number[]) => { mockQueue = mockQueue.filter((_, i) => !indexes.includes(i)); mockActive -= indexes.length; },
    removeUpcomingTracks: async () => { mockQueue = mockQueue.slice(0, mockActive + 1); },
    getQueue: async () => [...mockQueue], getActiveTrackIndex: async () => mockActive,
    getActiveTrack: async () => mockQueue[mockActive], getProgress: async () => ({ position: 3, duration: 20 }),
    setRate: async () => undefined, setRepeatMode: async () => undefined, seekTo: async () => undefined,
    skipToNext: async () => { mockActive += 1; mockPlaybackHandler?.({ type: 'active', track: mockQueue[mockActive] }); },
    pause: () => mockPause(), play: () => mockPlay(),
  },
  usePlaybackState: () => ({ state: 'paused' }), useProgress: () => ({ position: 0, duration: 20 }),
  State: { Paused: 'paused', Playing: 'playing', Ended: 'ended', Buffering: 'buffering', Loading: 'loading' },
  RepeatMode: { Off: 'off', Track: 'track' },
  Event: { PlaybackActiveTrackChanged: 'active', PlaybackError: 'error', PlaybackQueueEnded: 'ended', RemoteDuck: 'duck' },
}));

import { RadioPlayerProvider, useRadioPlayer } from '../RadioPlayerProvider';
function Observer() { mockContext = useRadioPlayer(); return null; }
async function flush() { await act(async () => { for (let i = 0; i < 80; i += 1) await Promise.resolve(); }); }
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((r) => { resolve = r; }); return { promise, resolve }; }

describe('radio native queue integration', () => {
  beforeEach(() => { mockProfile = { studyScope: 'all', target: 'icao4-first' }; mockQueue = []; mockActive = 0; jest.clearAllMocks(); mockLoadCatalogs.mockReset().mockResolvedValue([]); mockResolve.mockImplementation(async (path) => `file://${path}`); });
  afterEach(() => jest.restoreAllMocks());

  it('can select an authorized bank whose protected questions are not loaded yet', async () => {
    mockCatalogs.push({ bankId: 'radiotelephony', title: '陆空通话', nameEn: 'Radiotelephony', tracks: [] });
    const view = await render(<RadioPlayerProvider><Observer /></RadioPlayerProvider>); await flush();
    try {
      await act(() => mockContext.activateSession()); await flush();
      await act(() => mockContext.selectBank('radiotelephony')); await flush();
      expect(mockContext.currentCatalog?.bankId).toBe('radiotelephony');
      expect(mockLoadCatalogs).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ complete: true, bankId: 'radiotelephony' }));
    } finally { await view.unmount(); mockCatalogs.pop(); }
  });

  it('restores a remembered member question after switching back to an unloaded bank', async () => {
    mockCatalogs.push({ bankId: 'radiotelephony', title: '陆空通话', nameEn: 'Radiotelephony', tracks: [] });
    const view = await render(<RadioPlayerProvider><Observer /></RadioPlayerProvider>); await flush();
    try {
      await act(() => mockContext.activateSession()); await flush();
      await act(() => mockContext.selectTrack('t4', false)); await flush();
      mockCatalogs[0].tracks = mockTracks.slice(0, 1);
      await act(() => mockContext.selectBank('radiotelephony')); await flush();
      mockLoadCatalogs.mockImplementation(async (_selection, options) => {
        if (options?.complete) mockCatalogs[0].tracks = mockTracks;
        return [];
      });
      await act(() => mockContext.selectBank('listening')); await flush();
      expect(mockContext.currentTrack?.id).toBe('t4');
    } finally { await view.unmount(); mockCatalogs[0].tracks = mockTracks; mockCatalogs.pop(); }
  });

  it('keeps startup metadata-only and expands authorized text when the radio session opens', async () => {
    const view = await render(<RadioPlayerProvider><Observer /></RadioPlayerProvider>); await flush();
    expect(mockLoadCatalogs).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ complete: false, bankId: 'listening' }));
    await act(() => mockContext.activateSession()); await flush();
    expect(mockLoadCatalogs).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ complete: true, bankId: 'listening' }));
    await view.unmount();
  });

  it('shows directory failures and lets the user retry without restarting the app', async () => {
    mockLoadCatalogs.mockRejectedValueOnce(new Error('network unavailable'));
    const view = await render(<RadioPlayerProvider><Observer /></RadioPlayerProvider>); await flush();
    expect(mockContext.error).toBe('播放目录加载失败，请重试');
    expect(mockContext.loading).toBe(false);
    await act(() => mockContext.retry()); await flush();
    expect(mockLoadCatalogs).toHaveBeenCalledTimes(2);
    expect(mockContext.error).toBeUndefined();
    expect(mockContext.loading).toBe(false);
    expect(mockContext.catalogs[0].tracks).toHaveLength(6);
    await view.unmount();
  });

  it('clears the previous scope queue and rejects its late audio preparation', async () => {
    const slow = deferred<string>();
    const view = await render(<RadioPlayerProvider><Observer /></RadioPlayerProvider>); await flush();
    await act(() => mockContext.activateSession()); await flush();
    mockResolve.mockImplementation((path) => path === '/audio/5.mp3' ? slow.promise : Promise.resolve(`file://${path}`));
    await act(() => mockContext.selectTrack('t5', true)); await flush();
    mockProfile = { ...mockProfile, studyScope: 'crash' };
    await view.rerender(<RadioPlayerProvider><Observer /></RadioPlayerProvider>); await flush();
    const playCount = mockPlay.mock.calls.length;
    slow.resolve('file:///audio/5.mp3'); await flush();
    expect(mockContext.catalogs[0].tracks.map(track => track.id)).toEqual(['t0', 't1']);
    expect(mockContext.currentTrack?.id).toBe('t0');
    expect(mockQueue).toEqual([]);
    expect(mockPlay).toHaveBeenCalledTimes(playCount);
    await view.unmount();
  });

  it.each(['order', 'repeatOne', 'shuffle'] as const)('keeps bundled artwork on every content and interval through %s transitions', async (mode) => {
    const artwork = 'file:///app/assets/icon-native.png';
    jest.spyOn(Asset, 'fromModule').mockReturnValue({ localUri: null, uri: artwork } as Asset);
    const view = await render(<RadioPlayerProvider><Observer /></RadioPlayerProvider>); await flush();
    await act(() => mockContext.setMode(mode));
    await act(() => mockContext.setIntervalSeconds(5)); await flush();
    await act(() => mockContext.selectTrack('t0', true)); await flush();
    expect(mockQueue.filter((track) => track.radioTrackKind === 'content')).toHaveLength(4);
    expect(mockQueue.filter((track) => track.radioTrackKind === 'interval')).toHaveLength(3);
    expect(mockQueue.every((track) => track.artwork === artwork)).toBe(true);
    mockActive = 1;
    await act(() => mockPlaybackHandler?.({ type: 'active', track: mockQueue[1] })); await flush();
    expect(mockContext.waitingForNext).toBe(true);
    expect(mockQueue[mockActive].artwork).toBe(artwork);
    mockActive = 2;
    await act(() => mockPlaybackHandler?.({ type: 'active', track: mockQueue[2] })); await flush();
    await act(() => mockContext.pause()); await flush();
    await act(() => mockContext.play()); await flush();
    expect(mockQueue.every((track) => track.artwork === artwork)).toBe(true);
    expect(mockQueue[0].radioTrackKind).toBe('content');
    await view.unmount();
  });

  it('still plays and prepares successors if artwork resolution fails', async () => {
    jest.spyOn(Asset, 'fromModule').mockImplementation(() => { throw new Error('missing_artwork'); });
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const view = await render(<RadioPlayerProvider><Observer /></RadioPlayerProvider>); await flush();
    await act(() => mockContext.selectTrack('t0', true)); await flush();
    expect(mockPlay).toHaveBeenCalled();
    expect(mockQueue).toHaveLength(4);
    expect(mockContext.error).toBeUndefined();
    await view.unmount();
  });

  it('keeps a bounded prepared native window while automatic transitions prune history', async () => {
    const view = await render(<RadioPlayerProvider><Observer /></RadioPlayerProvider>); await flush();
    await act(() => mockContext.activateSession()); await flush();
    expect(mockQueue.map((track) => track.radioTrackId)).toEqual(['t0', 't1', 't2', 't3']);
    mockActive = 1;
    await act(() => mockPlaybackHandler?.({ type: 'active', track: mockQueue[1] })); await flush();
    expect(mockContext.currentTrack?.id).toBe('t1');
    expect(mockQueue.map((track) => track.radioTrackId)).toEqual(['t1', 't2', 't3', 't4']);
    expect(mockQueue).toHaveLength(4);
    await view.unmount();
  });
  it('starts selected audio without waiting for the next resource and lets pause win', async () => {
    const next = deferred<string>();
    mockResolve.mockImplementation((path) => path === '/audio/1.mp3' ? next.promise : Promise.resolve(`file://${path}`));
    const view = await render(<RadioPlayerProvider><Observer /></RadioPlayerProvider>); await flush();
    await act(() => mockContext.activateSession()); await flush();
    await act(() => mockContext.selectTrack('t0', true)); await flush();
    expect(mockPlay).toHaveBeenCalled();
    await act(() => mockContext.pause()); await flush();
    const playCount = mockPlay.mock.calls.length;
    next.resolve('file:///audio/1.mp3'); await flush();
    expect(mockPlay).toHaveBeenCalledTimes(playCount);
    await view.unmount();
  });
  it('discards a late selected resource after stop and does not recreate the queue', async () => {
    const slow = deferred<string>();
    const view = await render(<RadioPlayerProvider><Observer /></RadioPlayerProvider>); await flush();
    await act(() => mockContext.activateSession()); await flush();
    mockResolve.mockImplementation((path) => path === '/audio/5.mp3' ? slow.promise : Promise.resolve(`file://${path}`));
    await act(() => mockContext.selectTrack('t5', true)); await flush();
    await act(() => mockContext.stopAndClear()); await flush();
    const playCount = mockPlay.mock.calls.length;
    slow.resolve('file:///audio/5.mp3'); await flush();
    expect(mockQueue).toEqual([]);
    expect(mockPlay).toHaveBeenCalledTimes(playCount);
    expect(mockContext.sessionVisible).toBe(false);
    await view.unmount();
  });
  it('does not restart playback when the user pauses during current resource preparation', async () => {
    const slow = deferred<string>();
    const view = await render(<RadioPlayerProvider><Observer /></RadioPlayerProvider>); await flush();
    await act(() => mockContext.activateSession()); await flush();
    mockResolve.mockImplementation((path) => path === '/audio/5.mp3' ? slow.promise : Promise.resolve(`file://${path}`));
    await act(() => mockContext.selectTrack('t5', true)); await flush();
    await act(() => mockContext.pause()); await flush();
    const playCount = mockPlay.mock.calls.length;
    slow.resolve('file:///audio/5.mp3'); await flush();
    expect(mockPlay).toHaveBeenCalledTimes(playCount);
    expect(mockQueue[0].radioTrackId).toBe('t5');
    await view.unmount();
  });
  it('does not download radio resources merely because the App started', async () => {
    const view = await render(<RadioPlayerProvider><Observer /></RadioPlayerProvider>); await flush();
    expect(mockResolve).not.toHaveBeenCalled();
    expect(mockQueue).toEqual([]);
    await view.unmount();
  });
  it('performs one automatic content retry then exposes an actionable error', async () => {
    const view = await render(<RadioPlayerProvider><Observer /></RadioPlayerProvider>); await flush();
    await act(() => mockContext.selectTrack('t0', true)); await flush();
    const initialPlayCount = mockPlay.mock.calls.length;
    await act(() => mockPlaybackHandler?.({ type: 'error', code: 'network-error' })); await flush();
    expect(mockPlay).toHaveBeenCalledTimes(initialPlayCount + 1);
    await act(() => mockPlaybackHandler?.({ type: 'error', code: 'network-error' })); await flush();
    expect(mockPlay).toHaveBeenCalledTimes(initialPlayCount + 1);
    expect(mockContext.error).toContain('网络');
    expect(mockContext.loading).toBe(false);
    await view.unmount();
  });
  it('does not append the old order-mode prefetch after changing to repeat-one', async () => {
    const delayed = deferred<string>();
    mockResolve.mockImplementation((path) => path === '/audio/1.mp3' ? delayed.promise : Promise.resolve(`file://${path}`));
    const view = await render(<RadioPlayerProvider><Observer /></RadioPlayerProvider>); await flush();
    await act(() => mockContext.selectTrack('t0', true)); await flush();
    await act(() => mockContext.setMode('repeatOne')); await flush();
    delayed.resolve('file:///audio/1.mp3'); await flush();
    expect(mockQueue.map((track) => track.radioTrackId)).toEqual(['t0']);
    await view.unmount();
  });

  it('resumes only when the interruption ended permits it and user intent is unchanged', async () => {
    const view = await render(<RadioPlayerProvider><Observer /></RadioPlayerProvider>); await flush();
    await act(() => mockContext.selectTrack('t0', true)); await flush();
    const playingCount = mockPlay.mock.calls.length;
    await act(() => mockPlaybackHandler?.({ type: 'duck', paused: true })); await flush();
    await act(() => mockPlaybackHandler?.({ type: 'duck', paused: false })); await flush();
    expect(mockPlay).toHaveBeenCalledTimes(playingCount + 1);
    await act(() => mockPlaybackHandler?.({ type: 'duck', paused: true })); await flush();
    await act(() => mockContext.pause()); await flush();
    await act(() => mockPlaybackHandler?.({ type: 'duck', paused: false })); await flush();
    expect(mockPlay).toHaveBeenCalledTimes(playingCount + 1);
    await view.unmount();
  });

  it('removing an active gap in repeat-one switches to content instead of repeating silence', async () => {
    const view = await render(<RadioPlayerProvider><Observer /></RadioPlayerProvider>); await flush();
    await act(() => mockContext.setMode('repeatOne'));
    await act(() => mockContext.setIntervalSeconds(5)); await flush();
    await act(() => mockContext.selectTrack('t0', true)); await flush();
    expect(mockQueue[1].radioTrackKind).toBe('interval');
    mockActive = 1;
    await act(() => mockPlaybackHandler?.({ type: 'active', track: mockQueue[1] })); await flush();
    expect(mockContext.waitingForNext).toBe(true);
    await act(() => mockContext.setIntervalSeconds(0)); await flush();
    expect(mockQueue).toHaveLength(1);
    expect(mockQueue[0].radioTrackKind).toBe('content');
    expect(mockQueue[0].radioTrackId).toBe('t0');
    expect(mockContext.waitingForNext).toBe(false);
    await view.unmount();
  });

  it('pauses unconditionally for an exclusive owner transfer even if Play is tapped while queued', async () => {
    const view = await render(<RadioPlayerProvider><Observer /></RadioPlayerProvider>); await flush();
    await act(() => mockContext.selectTrack('t0', true)); await flush();
    const blocked = deferred<void>();
    const gate = mockCoordinator.run(() => true, () => blocked.promise);
    await Promise.resolve();
    const before = mockPause.mock.calls.length;
    await act(async () => {
      const deactivation = mockDeactivate();
      // This sets playback intent immediately, while native transfer is still waiting.
      const slow = deferred<string>();
      mockResolve.mockImplementation(() => slow.promise);
      const playing = mockContext.play();
      await Promise.resolve();
      blocked.resolve();
      await gate;
      await deactivation;
      expect(mockPause.mock.calls.length).toBeGreaterThan(before);
      mockContext.stopAndClear();
      slow.resolve('file:///unused.mp3');
      await playing;
    });
    await flush();
    await view.unmount();
  });
  it('does not restart an automatically advanced track when Next is tapped before refill', async () => {
    const view = await render(<RadioPlayerProvider><Observer /></RadioPlayerProvider>); await flush();
    await act(() => mockContext.selectTrack('t0', true)); await flush();
    mockActive = 1;
    await act(async () => {
      mockPlaybackHandler?.({ type: 'active', track: mockQueue[1] });
      await mockContext.next();
    });
    await flush();
    expect(mockContext.currentTrack?.id).toBe('t2');
    expect(mockQueue[0].radioTrackId).toBe('t2');
    await view.unmount();
  });

});
