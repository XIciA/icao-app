import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useEditorialArticle, useResourceEditorial } from '../use-editorial.native';
import { loadEditorialArticle, loadResourceEditorial, resolveEditorialCover } from '../repository';

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('@react-navigation/native', () => ({ useFocusEffect: (callback: () => void) => require('react').useEffect(callback, [callback]) }));
jest.mock('../repository', () => ({ loadEditorialArticle: jest.fn(), loadResourceEditorial: jest.fn(), resolveEditorialCover: jest.fn() }));
const list = jest.mocked(loadResourceEditorial), detail = jest.mocked(loadEditorialArticle), cover = jest.mocked(resolveEditorialCover);
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
beforeEach(() => jest.resetAllMocks());

it('shows article summaries before covers, updates each cover, and bounds requests', async () => {
  const pending = Array.from({ length: 6 }, () => deferred<string>());
  const items = pending.map((_, index) => ({ slug: String(index), title: `Article ${index}` }));
  list.mockResolvedValue({ data: { items }, source: 'remote' } as never);
  cover.mockImplementation(article => pending[Number(article.slug)].promise);
  const hook = await renderHook(() => useResourceEditorial());
  await waitFor(() => expect(hook.result.current.status).toBe('ready'));
  expect(hook.result.current).toMatchObject({ value: items });
  expect(cover).toHaveBeenCalledTimes(4);
  await act(async () => pending[1].resolve('https://example.com/second.jpg'));
  expect(hook.result.current).toMatchObject({ value: [items[0], { ...items[1], coverUrl: 'https://example.com/second.jpg' }, ...items.slice(2)] });
  expect(cover).toHaveBeenCalledTimes(5);
  await hook.unmount();
  await act(async () => pending.forEach(item => item.resolve('https://example.com/late.jpg')));
  expect(cover).toHaveBeenCalledTimes(5);
});

it('shows article text immediately and ignores a previous article cover after navigation', async () => {
  const first = deferred<string>(), second = deferred<string>();
  detail.mockImplementation(async slug => ({ data: { article: { slug, title: slug, blocks: [] } }, source: 'remote' }) as never);
  cover.mockImplementation(article => article.slug === 'first' ? first.promise : second.promise);
  const hook = await renderHook(({ slug }: { slug: string }) => useEditorialArticle(slug), { initialProps: { slug: 'first' } });
  await waitFor(() => expect(hook.result.current).toMatchObject({ status: 'ready', value: { slug: 'first' } }));
  await hook.rerender({ slug: 'second' });
  await waitFor(() => expect(hook.result.current).toMatchObject({ status: 'ready', value: { slug: 'second' } }));
  await act(async () => first.resolve('https://example.com/wrong.jpg'));
  expect(hook.result.current).toMatchObject({ value: { slug: 'second' } });
  expect('value' in hook.result.current && hook.result.current.value.coverUrl).toBeUndefined();
  await act(async () => second.resolve('https://example.com/right.jpg'));
  expect(hook.result.current).toMatchObject({ value: { slug: 'second', coverUrl: 'https://example.com/right.jpg' } });
});
