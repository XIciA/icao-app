import { act, renderHook, waitFor } from '@testing-library/react-native';

import {
  hotspotAccessInvalidationSnapshot,
  subscribeHotspotAccessInvalidation,
} from '../access-invalidation.native';

import { loadHotspotAccess } from '../access-loader.native';
import type { HotspotAccessResult } from '../access-state.native';
import { loadHotspotBriefs } from '../repository';
import { useHotspotAccess } from '../use-hotspot-access.native';
import { buildHotspotStudyPackage } from '../build-hotspot-study-package.native';
import completeQuestionBanks from '@/features/question-bank/data/question-bank.json';
import type { QuestionBankDataset } from '@/features/question-bank/types';

jest.mock('../access-invalidation.native', () => ({
  hotspotAccessInvalidationSnapshot: jest.fn(),
  subscribeHotspotAccessInvalidation: jest.fn(),
}));
jest.mock('../access-loader.native', () => ({ loadHotspotAccess: jest.fn() }));

const mockInvalidationSnapshot = jest.mocked(hotspotAccessInvalidationSnapshot);
const mockLoadHotspotAccess = jest.mocked(loadHotspotAccess);
const mockSubscribeInvalidation = jest.mocked(subscribeHotspotAccessInvalidation);

type Deferred<T> = {
  promise: Promise<T>;
  reject: (error: unknown) => void;
  resolve: (value: T) => void;
};

function deferred<T>(): Deferred<T> {
  let reject!: (error: unknown) => void;
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    reject = rejectPromise;
    resolve = resolvePromise;
  });
  return { promise, reject, resolve };
}

describe('useHotspotAccess Native lifecycle', () => {
  const brief = loadHotspotBriefs()[0];
  const membershipRequired: HotspotAccessResult = { brief, status: 'membership-required' };
  const networkError: HotspotAccessResult = { brief, status: 'network-error' };
  const mockUnsubscribe = jest.fn();
  let invalidateAccess: (() => void) | undefined;
  let invalidationSnapshot: string;

  beforeEach(() => {
    jest.clearAllMocks();
    invalidationSnapshot = 'production:0';
    invalidateAccess = undefined;
    mockInvalidationSnapshot.mockImplementation(() => invalidationSnapshot);
    mockSubscribeInvalidation.mockImplementation((listener) => {
      invalidateAccess = listener;
      return mockUnsubscribe;
    });
  });

  it('converts an unexpected loader rejection into a terminal safe state', async () => {
    mockLoadHotspotAccess.mockRejectedValue(new Error('unexpected loader rejection'));

    const hook = await renderHook(() => useHotspotAccess(brief.id));

    await waitFor(() => expect(hook.result.current.state.status).toBe('content-unavailable'));
    expect(hook.result.current.state).toMatchObject({ brief: { id: brief.id } });
    await hook.unmount();
  });

  it('keeps the newest retry result when an older request finishes late', async () => {
    const first = deferred<HotspotAccessResult>();
    const second = deferred<HotspotAccessResult>();
    mockLoadHotspotAccess
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const hook = await renderHook(() => useHotspotAccess(brief.id));
    await waitFor(() => expect(mockLoadHotspotAccess).toHaveBeenCalledTimes(1));

    await act(async () => { hook.result.current.retry(); });
    await waitFor(() => expect(mockLoadHotspotAccess).toHaveBeenCalledTimes(2));

    await act(async () => { second.resolve(networkError); await second.promise; });
    await waitFor(() => expect(hook.result.current.state.status).toBe('network-error'));
    await act(async () => { first.resolve(membershipRequired); await first.promise; });

    expect(hook.result.current.state.status).toBe('network-error');
    await hook.unmount();
  });

  it('reloads through the commercial integration seam when access is invalidated', async () => {
    mockLoadHotspotAccess
      .mockResolvedValueOnce(membershipRequired)
      .mockResolvedValueOnce(networkError);
    const hook = await renderHook(() => useHotspotAccess(brief.id));
    await waitFor(() => expect(hook.result.current.state.status).toBe('membership-required'));

    invalidationSnapshot = 'production:1';
    await act(async () => { invalidateAccess?.(); });

    await waitFor(() => expect(mockLoadHotspotAccess).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(hook.result.current.state.status).toBe('network-error'));
    await hook.unmount();
  });

  it('ignores a pending request after unmount without an unhandled rejection', async () => {
    const pending = deferred<HotspotAccessResult>();
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockLoadHotspotAccess.mockReturnValue(pending.promise);
    const hook = await renderHook(() => useHotspotAccess(brief.id));
    await waitFor(() => expect(mockLoadHotspotAccess).toHaveBeenCalledTimes(1));

    await hook.unmount();
    await act(async () => { pending.reject(new Error('late rejection')); await pending.promise.catch(() => undefined); });

    expect(mockUnsubscribe).toHaveBeenCalled();
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('preserves a started paper during entitlement refresh, while explicit retries still rebuild', async () => {
    const session = buildHotspotStudyPackage(brief, (completeQuestionBanks as QuestionBankDataset[]).find(bank => bank.id === 'opi')!);
    const ready: HotspotAccessResult = { status: 'ready', brief, topics: [], session };
    mockLoadHotspotAccess.mockResolvedValue(ready);
    const hook = await renderHook(() => useHotspotAccess(brief.id, { freezeReadyForStudy: true }));
    await waitFor(() => expect(hook.result.current.state.status).toBe('ready'));
    invalidationSnapshot = 'production:1';
    await act(async () => invalidateAccess?.());
    expect(mockLoadHotspotAccess).toHaveBeenCalledTimes(1);
    expect(hook.result.current.state).toBe(ready);
    await act(async () => hook.result.current.retry());
    await waitFor(() => expect(mockLoadHotspotAccess).toHaveBeenCalledTimes(2));
  });
});
