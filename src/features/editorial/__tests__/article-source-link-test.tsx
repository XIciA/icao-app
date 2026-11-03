import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { Linking } from 'react-native';
import { EditorialArticleScreen } from '../EditorialArticleScreen';

jest.mock('../use-editorial', () => ({ useEditorialArticle: () => ({ status: 'ready', value: {
  badge: '资料', title: '文章', summary: '摘要', cover: { alt: '封面' }, blocks: [],
  sourceLinks: [{ title: '来源', publisher: '发布方', url: 'https://example.com/article' }],
} }) }));
jest.mock('@/components/navigation/TopBar', () => ({ TopBar: () => null }));
jest.mock('@/components/ui', () => {
  const { Text, View } = jest.requireActual('react-native');
  return { AppText: Text, Tag: Text, Screen: View };
});
it('keeps a failed source link retryable without an unhandled rejection', async () => {
  const open = jest.spyOn(Linking, 'openURL').mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(true);
  const view = await render(<EditorialArticleScreen slug="article" />);
  fireEvent.press(view.getByRole('link'));
  await waitFor(() => expect(view.getByText('暂时无法打开，点击重试')).toBeTruthy());
  fireEvent.press(view.getByRole('link'));
  await waitFor(() => expect(view.getByText('发布方')).toBeTruthy());
  expect(open).toHaveBeenCalledTimes(2);
  open.mockRestore();
});
