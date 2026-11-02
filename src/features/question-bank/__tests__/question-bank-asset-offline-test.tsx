import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useQuestionBankAsset } from '../hooks/useQuestionBankAsset';

let mockConnectivity = 'offline';
const mockResolve = jest.fn();
jest.mock('../platform/use-connectivity', () => ({ useConnectivity: () => mockConnectivity }));
jest.mock('../platform/resource-service', () => ({
  resolveQuestionBankAsset: () => undefined,
  resolveRemoteQuestionBankAsset: (...args: unknown[]) => mockResolve(...args),
}));
beforeEach(() => { mockConnectivity = 'offline'; mockResolve.mockReset(); });

it('keeps unavailable audio inline and automatically retries after reconnection', async () => {
  mockResolve.mockRejectedValueOnce({ code: 'offline_resource_missing' }).mockResolvedValue('file:audio');
  const hook = await renderHook(() => useQuestionBankAsset('/audio.mp3'));
  await waitFor(() => expect(hook.result.current.unavailable).toBe(true));
  expect(hook.result.current.error).toBe('音频未下载，联网后可播放');
  mockConnectivity = 'online'; await hook.rerender({});
  await waitFor(() => expect(hook.result.current.uri).toBe('file:audio'));
  expect(hook.result.current.unavailable).toBeUndefined();
});

it('does not replace a playable local source when the network changes', async () => {
  mockResolve.mockResolvedValue('file:audio');
  const hook = await renderHook(() => useQuestionBankAsset('/audio.mp3'));
  await waitFor(() => expect(hook.result.current.uri).toBe('file:audio'));
  mockConnectivity = 'online'; await hook.rerender({});
  mockConnectivity = 'offline'; await hook.rerender({});
  await act(async () => {});
  expect(mockResolve).toHaveBeenCalledTimes(1);
  expect(hook.result.current.uri).toBe('file:audio');
});
