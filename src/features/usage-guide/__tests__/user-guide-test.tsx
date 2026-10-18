import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { UserGuideScreen } from '../UserGuideScreen';
import { loadQuestionBank } from '@/features/question-bank/data/repository.native';
import type { QuestionBankDataset } from '@/features/question-bank/types';
import { TUTORIAL_STEPS } from '../tutorial-model';
jest.mock('react', () => ({ ...jest.requireActual('react'), lazy: () => jest.requireMock('@/features/question-bank/export/SentenceExportScreen').SentenceExportScreen }));
const mockPush = jest.fn();
let mockAccount = 'guide-a';
const mockRead = jest.fn();
const mockExport = jest.fn();
jest.mock('@/features/question-bank/data/repository.native', () => ({ loadQuestionBank: jest.fn() }));
jest.mock('@/features/question-bank/export/SentenceExportScreen', () => ({ SentenceExportScreen: (props: unknown) => { mockExport(props); return null; } }));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, back: jest.fn(), canGoBack: () => true }), useFocusEffect: (fn: () => void) => jest.requireActual('react').useEffect(fn, [fn]) }));
jest.mock('@/features/auth/AuthProvider', () => ({ useAuth: () => ({ account: { accountId: mockAccount } }) }));
jest.mock('../tutorial-progress', () => ({ readTutorialProgress: (...args: unknown[]) => mockRead(...args) }));
jest.mock('../HelpFaqList', () => ({ HelpFaqList: () => null }));
beforeEach(() => { mockPush.mockClear(); mockExport.mockClear(); mockAccount = 'guide-a'; mockRead.mockResolvedValue({ version: 1, step: 0, completed: [], skipped: [] }); });
it('offers exactly the five discovery modules, the real tutorial route and existing export entry', async () => {
  const screen = await render(<UserGuideScreen />);
  for (const title of ['单词学习', '随身听', 'OPI 热点', '资源分享', '模拟练习']) expect(screen.getByText(title)).toBeTruthy();
  expect(screen.queryByText('意见反馈')).toBeNull();
  await fireEvent.press(screen.getByText('开始新手教程'));
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/info/[slug]', params: { slug: 'tutorial' } });
  jest.mocked(loadQuestionBank).mockResolvedValueOnce({ dataset: { id: 'sentences900' } as QuestionBankDataset, source: 'embedded' });
  await fireEvent.press(screen.getByText('前往900句导出'));
  await waitFor(() => expect(mockExport).toHaveBeenCalledWith(expect.objectContaining({ dataset: expect.objectContaining({ id: 'sentences900' }) })));
  expect(loadQuestionBank).toHaveBeenCalledWith('sentences900');
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

it('ignores an export catalog loaded for the previous account', async () => {
  let resolve!: (value: Awaited<ReturnType<typeof loadQuestionBank>>) => void;
  jest.mocked(loadQuestionBank).mockReturnValueOnce(new Promise(done => { resolve = done; }));
  const screen = await render(<UserGuideScreen />);
  await fireEvent.press(screen.getByText('前往900句导出'));
  mockAccount = 'guide-b';
  await screen.rerender(<UserGuideScreen />);
  await act(async () => { resolve({ dataset: { id: 'sentences900' } as QuestionBankDataset, source: 'remote' }); });
  expect(mockExport).not.toHaveBeenCalled();
  expect(screen.getByText('使用指南')).toBeTruthy();
});
