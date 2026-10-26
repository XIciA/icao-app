import { act, renderHook, waitFor } from '@testing-library/react-native';
import catalog from '../../../../content/vocabulary/three-books/dataset.json';
import { loadVocabulary, type VocabularyLoadOptions, type VocabularyLoadResult } from '../catalog-loader';
import { useVocabularyCatalog } from '../use-vocabulary-catalog';
let mockBase = 'https://first.invalid';
jest.mock('@/platform/api-client', () => ({ getApiBaseUrl: () => mockBase }));

jest.mock('../repository', () => ({ loadVocabulary: (...args: unknown[]) => jest.requireMock('../catalog-loader').loadVocabulary(...args) }));
jest.mock('../catalog-loader', () => ({ loadVocabulary: jest.fn() }));
const initial = { dataset: catalog, source: 'cache' } as VocabularyLoadResult;
const updated = { dataset: { ...catalog, version: 4 }, source: 'remote' } as VocabularyLoadResult;
let refresh: NonNullable<VocabularyLoadOptions['onRefresh']>;
beforeEach(() => {
  jest.clearAllMocks();
  mockBase = 'https://first.invalid';
  jest.mocked(loadVocabulary).mockImplementation(async options => { refresh = options!.onRefresh!; return initial; });
});
it('keeps the study/test snapshot and applies the buffered release only after returning to books', async () => {
  const { result, rerender } = await renderHook(({ allowed }: { allowed: boolean }) => useVocabularyCatalog(allowed), { initialProps: { allowed: true } });
  await waitFor(() => expect(result.current.loadResult).toBe(initial));
  await rerender({ allowed: false });
  await act(() => refresh(updated));
  expect(result.current.loadResult).toBe(initial);
  await rerender({ allowed: true });
  expect(result.current.loadResult).toBe(updated);
});
it('ignores obsolete callbacks after retry and unmount', async () => {
  const { result, unmount } = await renderHook(() => useVocabularyCatalog());
  await waitFor(() => expect(result.current.loadResult).toBe(initial));
  const oldRefresh = refresh;
  await act(() => result.current.retry());
  await waitFor(() => expect(loadVocabulary).toHaveBeenCalledTimes(2));
  await act(() => oldRefresh(updated)); expect(result.current.loadResult).toBe(initial);
  await unmount(); await act(() => refresh(updated));
});
it('does not overwrite a fast refresh with the initial cache result', async () => {
  jest.mocked(loadVocabulary).mockImplementation(async options => { options!.onRefresh!(updated); return initial; });
  const { result } = await renderHook(() => useVocabularyCatalog());
  await waitFor(() => expect(result.current.loadResult).toBe(updated));
});
it('discards an already buffered catalog when the API source changes and reloads', async () => {
  const { result, rerender } = await renderHook(({ allowed }: { allowed: boolean }) => useVocabularyCatalog(allowed), { initialProps: { allowed: true } });
  await waitFor(() => expect(result.current.loadResult).toBe(initial));
  await rerender({ allowed: false });
  await act(() => refresh(updated));
  const other: VocabularyLoadResult = { ...initial, dataset: { ...initial.dataset, version: 9 } };
  jest.mocked(loadVocabulary).mockResolvedValue(other);
  mockBase = 'https://second.invalid';
  await rerender({ allowed: true });
  await waitFor(() => expect(result.current.loadResult).toBe(other));
  expect(loadVocabulary).toHaveBeenCalledTimes(2);
});
