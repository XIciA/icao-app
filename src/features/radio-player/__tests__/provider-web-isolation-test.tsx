/* eslint-disable import/first */
import React from 'react';
import { act, render } from '@testing-library/react-native';
import type { RadioPlayerContextValue } from '../types';
const mockTrack = { id: 'public', bankId: 'listening', bankTitle: '听力', categoryId: 'c', categoryTitle: 'C', topicId: 't', topicTitle: 'T', title: 'Public', audioText: 'public', audioPath: '/public.mp3', durationSeconds: 20, stableIndex: 0 };
const mockPublic = [{ bankId: 'listening', title: '听力', nameEn: 'Listening', tracks: [mockTrack] }];
const mockPrivate = [{ ...mockPublic[0], tracks: [{ ...mockTrack, id: 'private', audioText: 'member A secret', audioPath: '/private.mp3' }] }];
let mockAuth: any;
let mockValue: RadioPlayerContextValue;
const mockLoad = jest.fn();
const mockResolve = jest.fn(async () => 'https://example.test/audio');
const emptyStatus = () => ({ duration: 0, currentTime: 0, playing: false, isBuffering: false, isLoaded: false, didJustFinish: false });
let mockCurrentStatus = emptyStatus();
const mockPlayer = {
  pause: jest.fn(), play: jest.fn(), replace: jest.fn(), setPlaybackRate: jest.fn(), seekTo: jest.fn(async () => undefined),
  get currentStatus() { return mockCurrentStatus; },
  get isLoaded() { return mockCurrentStatus.isLoaded; },
};
jest.mock('@/platform/audio/browser-audio-player', () => ({ useBrowserAudioPlayer: () => mockPlayer }));
jest.mock('@/features/auth/AuthProvider', () => ({ useAuth: () => mockAuth }));
jest.mock('@/config/web-runtime', () => ({ isEdgeOneProductionWeb: () => true }));
jest.mock('../catalog.browser', () => ({ getEmbeddedRadioCatalogs: () => mockPublic, loadRadioCatalogs: () => mockLoad() }));
jest.mock('@/features/question-bank/platform/resource-service', () => ({ resolveRemoteQuestionBankAsset: () => mockResolve(), resolveQuestionBankAsset: () => undefined }));
jest.mock('@/platform/audio', () => ({ audioSessionOrchestrator: { acquire: async () => ({token: 'lease'}), release: async () => undefined, register: () => () => undefined } }));
jest.mock('@/platform/storage', () => ({ __esModule: true, default: { getItem: async () => null, setItem: async () => undefined } }));
import { beginCommerceEntitlementGeneration, publishCommerceEntitlementChange, resetCommerceEntitlementEventsForTests } from '@/features/native-commercial-testflight/commerce-entitlement-events';
import { RadioPlayerProvider, useRadioPlayer } from '../RadioPlayerProvider.browser';
function Observer() { mockValue = useRadioPlayer(); return null; }
const tree = () => <RadioPlayerProvider><Observer /></RadioPlayerProvider>;
async function flush() { await act(async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); }); }
function account(id?: string) { mockAuth = { restoring: false, session: id ? {user: {id}} : undefined, account: id ? {accountId: id} : undefined }; }
function deferred<T>() { let resolve!: (value:T)=>void; return { promise: new Promise<T>(r=>{resolve=r;}), resolve: (value:T)=>resolve(value) }; }
beforeEach(() => {
  jest.clearAllMocks(); resetCommerceEntitlementEventsForTests(); account('A');
  mockCurrentStatus = emptyStatus();
  mockPlayer.replace.mockImplementation(() => { mockCurrentStatus = emptyStatus(); });
  mockLoad.mockResolvedValue(mockPrivate); mockResolve.mockResolvedValue('https://example.test/audio');
});

it('clears member A content synchronously on logout and keeps it cleared when B is offline', async () => {
  const view = await render(tree()); await flush();
  await act(() => mockValue.activateSession()); await flush();
  expect(mockValue.currentTrack?.audioText).toBe('member A secret');
  account(); await view.rerender(tree());
  expect(mockValue.catalogs).toEqual(mockPublic); expect(mockPlayer.pause).toHaveBeenCalled(); expect(mockPlayer.replace).toHaveBeenCalledWith(null);
  mockLoad.mockRejectedValue(new Error('offline')); account('B'); await view.rerender(tree()); await flush(); await act(() => mockValue.activateSession()); await flush();
  expect(mockValue.catalogs).toEqual(mockPublic); expect(mockValue.catalogError).toContain('播放列表加载失败'); expect(mockValue.error).toBeUndefined();
  await view.unmount();
});

it('discards A catalogue and audio URL responses after switching to B', async () => {
  const load = deferred<typeof mockPrivate>(); const audio = deferred<string>();
  mockLoad.mockReturnValue(load.promise); mockResolve.mockReturnValue(audio.promise);
  const view = await render(tree()); await flush();
  await act(() => mockValue.activateSession()); await flush();
  account('B'); mockLoad.mockRejectedValue(new Error('offline')); mockResolve.mockRejectedValue(new Error('offline')); await view.rerender(tree()); await flush();
  await act(async () => { load.resolve(mockPrivate); audio.resolve('https://example.test/A-secret'); }); await flush();
  expect(mockValue.catalogs).toEqual(mockPublic);
  expect(mockPlayer.replace).not.toHaveBeenCalledWith('https://example.test/A-secret');
  await view.unmount();
});

it('clears protected content immediately when membership is revoked, even if reload fails', async () => {
  const event = beginCommerceEntitlementGeneration('A');
  publishCommerceEntitlementChange({ ...event, snapshot: {membership: {active: true}} as any });
  const view = await render(tree()); await flush(); await act(() => mockValue.activateSession()); await flush();
  expect(mockValue.currentTrack?.audioText).toBe('member A secret');
  mockLoad.mockRejectedValue(new Error('offline'));
  await act(() => { publishCommerceEntitlementChange({ ...event, snapshot: {membership: {active: false}} as any, reason: 'membership-expired' }); }); await flush();
  expect(mockValue.catalogs).toEqual(mockPublic);
  await view.unmount();
});

it('advances once per actual media completion while old loaded/ended events survive replacement', async () => {
  const tracks = Array.from({ length: 3 }, (_, index) => ({ ...mockTrack, id: `track-${index}`, audioPath: `/track-${index}.mp3` }));
  mockLoad.mockResolvedValue([{ ...mockPublic[0], tracks }]);
  const view = await render(tree()); await flush();
  await act(() => mockValue.activateSession()); await flush();
  mockCurrentStatus = { ...emptyStatus(), isLoaded: true, duration: 20 };
  await view.rerender(tree()); await flush();
  await act(() => mockValue.play()); await flush();
  expect(mockPlayer.play).toHaveBeenCalledTimes(1);

  const nextAudio = deferred<string>(); mockResolve.mockReturnValue(nextAudio.promise);
  mockCurrentStatus = { ...mockCurrentStatus, currentTime: 20, didJustFinish: true };
  await view.rerender(tree()); await flush();
  expect(mockValue.currentTrack?.id).toBe('track-1');
  expect(mockValue.loading).toBe(true);
  expect(mockValue.position).toBe(0);
  await view.rerender(tree()); await flush();
  expect(mockPlayer.play).toHaveBeenCalledTimes(1);
  expect(mockValue.currentTrack?.id).toBe('track-1');

  await act(async () => nextAudio.resolve('https://example.test/second')); await flush();
  expect(mockValue.loading).toBe(true);
  mockCurrentStatus = { ...emptyStatus(), isLoaded: true, duration: 11 };
  await view.rerender(tree()); await flush();
  expect(mockValue.currentTrack?.id).toBe('track-1');
  expect(mockValue.duration).toBe(11);
  expect(mockPlayer.play).toHaveBeenCalledTimes(2);

  mockCurrentStatus = { ...mockCurrentStatus, currentTime: 5, playing: true };
  await view.rerender(tree()); await flush();
  expect(mockValue.position).toBe(5);
  expect(mockValue.currentTrack?.id).toBe('track-1');
  mockCurrentStatus = { ...mockCurrentStatus, currentTime: 11, playing: false, didJustFinish: true };
  await view.rerender(tree()); await flush();
  expect(mockValue.currentTrack?.id).toBe('track-2');
  expect(mockPlayer.play).toHaveBeenCalledTimes(2);
  await view.unmount();
});

it('waits for the replacement in repeat-one mode instead of replaying the old ended status', async () => {
  const view = await render(tree()); await flush();
  await act(() => mockValue.activateSession()); await flush();
  mockCurrentStatus = { ...emptyStatus(), isLoaded: true, duration: 20 };
  await view.rerender(tree()); await flush();
  await act(() => mockValue.setMode('repeatOne'));
  await act(() => mockValue.play()); await flush();
  mockCurrentStatus = { ...mockCurrentStatus, currentTime: 20, didJustFinish: true };
  await view.rerender(tree()); await flush();
  expect(mockValue.currentTrack?.id).toBe('private');
  expect(mockValue.loading).toBe(true);
  expect(mockPlayer.play).toHaveBeenCalledTimes(1);
  mockCurrentStatus = { ...emptyStatus(), isLoaded: true, duration: 20 };
  await view.rerender(tree()); await flush();
  expect(mockPlayer.play).toHaveBeenCalledTimes(2);
  expect(mockValue.position).toBe(0);
  await view.unmount();
});
