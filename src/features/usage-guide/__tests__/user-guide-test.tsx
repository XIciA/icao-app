import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { UserGuideScreen } from '../UserGuideScreen';
import { TUTORIAL_STEPS } from '../tutorial-model';
const mockPush = jest.fn();
let mockAccount = 'guide-a';
const mockRead = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, back: jest.fn(), canGoBack: () => true }), useFocusEffect: (fn: () => void) => jest.requireActual('react').useEffect(fn, [fn]) }));
jest.mock('@/features/auth/AuthProvider', () => ({ useAuth: () => ({ account: { accountId: mockAccount } }) }));
jest.mock('../tutorial-progress', () => ({ readTutorialProgress: (...args: unknown[]) => mockRead(...args) }));
jest.mock('../HelpFaqList', () => ({ HelpFaqList: () => null }));
beforeEach(() => { mockPush.mockClear(); mockAccount = 'guide-a'; mockRead.mockResolvedValue({ version: 1, step: 0, completed: [], skipped: [] }); });
it('offers exactly the five discovery modules, the real tutorial route and existing export entry', async () => {
  const screen = await render(<UserGuideScreen />);
  for (const title of ['单词学习', '随身听', 'OPI 热点', '资源分享', '模拟练习']) expect(screen.getByText(title)).toBeTruthy();
  expect(screen.queryByText('意见反馈')).toBeNull();
  await fireEvent.press(screen.getByText('开始新手教程'));
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/info/[slug]', params: { slug: 'tutorial' } });
  await fireEvent.press(screen.getByText('前往900句导出'));
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/question-bank/[bankId]', params: { bankId: 'sentences900', export: '1' } });
});
it('offers continuation and restart without removing existing learning content', async () => {
  mockRead.mockResolvedValue({ version: 1, step: 4, completed: [], skipped: [] });
  const screen = await render(<UserGuideScreen />);
  await waitFor(() => expect(screen.getByText('继续教程')).toBeTruthy());
  await fireEvent.press(screen.getByText('从头体验（保留学习数据）'));
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/info/[slug]', params: { slug: 'tutorial', restart: '1' } });
});
it('never shows an old account resume state while the next account is loading', async () => {
  mockRead.mockResolvedValueOnce({ version: 1, step: TUTORIAL_STEPS.length, completed: [], skipped: [] });
  const screen = await render(<UserGuideScreen />);
  await waitFor(() => expect(screen.getByText('重新体验')).toBeTruthy());
  mockAccount = 'guide-b'; mockRead.mockReturnValue(new Promise(() => {}));
  await screen.rerender(<UserGuideScreen />);
  expect(screen.queryByText('重新体验')).toBeNull();
  expect(screen.getByText('开始新手教程')).toBeTruthy();
});
