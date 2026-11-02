import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useOfflineBooks } from '../use-offline-books.native';
import type { VocabularyBook } from '@icao/contracts';

let mockPackages: Record<string, unknown> = {};
const mockListeners = new Set<() => void>();
const mockAvailable = jest.fn(async (book: VocabularyBook) => book);
jest.mock('@/features/question-bank/platform/use-connectivity', () => ({ useConnectivity: () => 'offline' }));
jest.mock('@/features/question-bank/downloads/download-events', () => ({ subscribeDownloadAvailability: (listener: () => void) => { mockListeners.add(listener); return () => mockListeners.delete(listener); } }));
jest.mock('@/features/question-bank/downloads/download-manager.native', () => ({ prepareDownloads: async () => {}, downloadSnapshot: () => mockPackages }));
jest.mock('../offline-content.native', () => ({ availableOfflineWords: (...args: [VocabularyBook]) => mockAvailable(...args) }));

it('retains vocabulary during unrelated bank changes and rechecks actual vocabulary deletion', async () => {
  const books = [{ id: 'preview', words: [{ id: 'one' }] }] as VocabularyBook[];
  mockPackages = { 'vocabulary:preview': { saved: { fingerprint: 'one', vocabulary: true } } };
  const hook = await renderHook(() => useOfflineBooks(books));
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  await act(() => { mockPackages = { ...mockPackages, listening: { phase: 'paused' } }; mockListeners.forEach(listener => listener()); });
  expect(hook.result.current.books).toEqual(books);
  expect(mockAvailable).toHaveBeenCalledTimes(1);
  mockAvailable.mockResolvedValueOnce({ ...books[0], words: [] });
  await act(() => { mockPackages = {}; mockListeners.forEach(listener => listener()); });
  await waitFor(() => expect(hook.result.current.books).toEqual([]));
  expect(mockAvailable).toHaveBeenCalledTimes(2);
});
