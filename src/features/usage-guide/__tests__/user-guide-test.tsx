import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { UserGuideScreen } from '../UserGuideScreen';
import { loadQuestionBank } from '@/features/question-bank/data/repository.native';
import type { QuestionBankDataset } from '@/features/question-bank/types';
import { GUIDE_ENTRIES } from '../guide-flows';
jest.mock('react', () => ({ ...jest.requireActual('react'), lazy: () => jest.requireMock('@/features/question-bank/export/SentenceExportScreen').SentenceExportScreen }));
const mockPush = jest.fn(), mockStart = jest.fn();
let mockAccount = 'guide-a';
let mockGuideCurrent: string | undefined;
const mockRead = jest.fn(), mockExport = jest.fn();
jest.mock('../GuideBindings', () => ({ useGuide: () => ({ current: mockGuideCurrent, start: mockStart, pause: jest.fn() }) }));
jest.mock('@/features/question-bank/data/repository.native', () => ({ loadQuestionBank: jest.fn() }));
jest.mock('@/features/question-bank/export/SentenceExportScreen', () => ({ SentenceExportScreen: (props: unknown) => { mockExport(props); return null; } }));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, back: jest.fn(), canGoBack: () => true }), useFocusEffect: (fn: () => void) => jest.requireActual('react').useEffect(fn, [fn]) }));
jest.mock('@/features/auth/AuthProvider', () => ({ useAuth: () => ({ account: { accountId: mockAccount } }) }));
beforeEach(() => { mockPush.mockClear(); mockStart.mockClear(); mockExport.mockClear(); mockAccount = 'guide-a'; mockGuideCurrent = undefined; mockRead.mockResolvedValue({ version: 1, step: 0, completed: [], skipped: [] }); });
it('offers all shared teaching entries, no FAQ or marketing body, and reuses the real export component', async () => {
  const screen = await render(<UserGuideScreen />);
  for (const { title } of GUIDE_ENTRIES) expect(screen.getByRole('button', { name: title })).toBeTruthy();
  for (const removed of ['常见问题','意见反馈','发现更多学习方式','学习成果，还能这样用']) expect(screen.queryByText(removed)).toBeNull();
  await fireEvent.press(screen.getByText('题库学习'));
  expect(mockStart).toHaveBeenCalledWith('study');
  await fireEvent.press(screen.getByText('随身听')); expect(mockStart).toHaveBeenCalledWith('radio');
  jest.mocked(loadQuestionBank).mockResolvedValueOnce({ dataset: { id: 'sentences900' } as QuestionBankDataset, source: 'embedded' });
  await fireEvent.press(screen.getByText('900句导出'));
  await waitFor(() => expect(mockExport).toHaveBeenCalledWith(expect.objectContaining({ dataset: expect.objectContaining({ id: 'sentences900' }) })));
});
it('ignores an export catalog loaded for the previous account', async () => {
  let resolve!: (value: Awaited<ReturnType<typeof loadQuestionBank>>) => void;
  jest.mocked(loadQuestionBank).mockReturnValueOnce(new Promise(done => { resolve = done; }));
  const screen = await render(<UserGuideScreen />); await fireEvent.press(screen.getByText('900句导出'));
  await new Promise(resolve => setTimeout(resolve, 460));
  mockAccount = 'guide-b'; await screen.rerender(<UserGuideScreen />);
  await act(async () => { resolve({ dataset: { id: 'sentences900' } as QuestionBankDataset, source: 'remote' }); });
  expect(mockExport).not.toHaveBeenCalled(); expect(screen.getByText('使用指南')).toBeTruthy();
});

it('keeps the actual export screen open when teaching is exited', async () => {
  mockGuideCurrent = 'export';
  jest.mocked(loadQuestionBank).mockResolvedValueOnce({ dataset: { id: 'sentences900' } as QuestionBankDataset, source: 'embedded' });
  const screen = await render(<UserGuideScreen />);
  await fireEvent.press(screen.getByText('900句导出'));
  await waitFor(() => expect(mockExport).toHaveBeenCalled());
  mockGuideCurrent = undefined;
  await screen.rerender(<UserGuideScreen />);
  expect(screen.queryByRole('button', { name: '900句导出' })).toBeNull();
});

it('does not start an export tour when its real catalog cannot load', async () => {
  jest.mocked(loadQuestionBank).mockRejectedValueOnce(new Error('offline'));
  const screen = await render(<UserGuideScreen />);
  await fireEvent.press(screen.getByText('900句导出'));
  await waitFor(() => expect(screen.getByText('900句暂时无法读取，请联网后重试。')).toBeTruthy());
  expect(mockStart).not.toHaveBeenCalled();
  expect(mockExport).not.toHaveBeenCalled();
});

it('opens the two review guides directly without an intermediate choice sheet', async () => {
  const screen=await render(<UserGuideScreen/>);
  await fireEvent.press(screen.getByText('回顾学习记录'));expect(mockStart).toHaveBeenLastCalledWith('records');
  await fireEvent.press(screen.getByText('回顾我的标注'));expect(mockStart).toHaveBeenLastCalledWith('recap');
  expect(screen.queryByText('选择要体验的内容')).toBeNull();
});
