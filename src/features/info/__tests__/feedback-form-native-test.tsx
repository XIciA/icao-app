import { Alert } from 'react-native';
import { usePreventRemove } from '@react-navigation/native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { InfoScreen } from '../InfoScreen.native';

jest.mock('@/features/auth/AuthProvider', () => ({ useAuth: () => ({}) }));
jest.mock('@/features/feedback/FeedbackHistory.native', () => ({ FeedbackHistory: () => null }));
jest.mock('@/features/app-updates/AppUpdatePrompt', () => ({ AppUpdatePrompt: () => null }));
const mockDismissTo = jest.fn();
const mockSubmit = jest.fn();
let mockParams: Record<string, string> = { slug: 'feedback', source: 'profile', compose: '1' };
let mockId = 0;
jest.mock('expo-router', () => ({ useLocalSearchParams: () => mockParams, useRouter: () => ({ canGoBack: () => true, back: jest.fn(), replace: jest.fn(), dismissTo: mockDismissTo }) }));
jest.mock('@react-navigation/native', () => ({ useFocusEffect: jest.fn(), usePreventRemove: jest.fn(), useNavigation: () => ({ dispatch: jest.fn() }) }));
jest.mock('expo-image-picker', () => ({ requestMediaLibraryPermissionsAsync: jest.fn(), launchImageLibraryAsync: jest.fn() }));
jest.mock('@/features/feedback/feedback-client.native', () => ({ createClientSubmissionId: () => `id-${++mockId}`, submitFeedback: (...args: unknown[]) => mockSubmit(...args) }));
jest.mock('@/features/app-content/repository.native', () => ({ builtinAppContent: { help: [], legal: {} }, loadAppContent: jest.fn() }));
function screen() {
  return <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, bottom: 34, left: 0, right: 0 } }}><InfoScreen /></SafeAreaProvider>;
}
beforeEach(() => { jest.clearAllMocks(); mockParams = { slug: 'feedback', source: 'profile', compose: '1' }; mockId = 0; });

it('starts exam details empty, cancels without choosing today, preserves the selected category, and treats metadata as dirty',async()=>{
 mockParams={slug:'feedback',source:'exam_report',compose:'1'};
 const view=await render(screen());
 expect(view.getByText('选择日期')).toBeTruthy();expect(view.getByLabelText('考点名称').props.value).toBe('');
 await fireEvent.press(view.getByLabelText('考试时间'));
 await fireEvent.press(view.getByText('取消'));
 expect(view.getByText('选择日期')).toBeTruthy();
 await fireEvent.press(view.getByText('听力'));
 await fireEvent.changeText(view.getByLabelText('考点名称'),'上海');
 expect(jest.mocked(usePreventRemove).mock.calls.at(-1)?.[0]).toBe(true);
 mockSubmit.mockResolvedValue({ticketNumber:'FB-exam'});
 await fireEvent.changeText(view.getByPlaceholderText('请描述相关题型的考情。'),'本次考试的听力考情');
 await fireEvent.press(view.getByTestId('feedback-submit'));
 await waitFor(()=>expect(mockSubmit).toHaveBeenCalledWith(expect.objectContaining({category:'listening',examDate:undefined,examCenter:'上海'})));
});

it('selects and clears a date-only value, and creates a new idempotency key when exam details change after a failed attempt',async()=>{
 mockParams={slug:'feedback',source:'exam_report',compose:'1'};mockSubmit.mockRejectedValue(new Error('offline'));
 const view=await render(screen());
 const now=new Date();const date=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-15`;
 await fireEvent.press(view.getByLabelText('考试时间'));await fireEvent.press(view.getByLabelText(date));await fireEvent.press(view.getByText('确定'));
 expect(view.getByText(date)).toBeTruthy();
 await fireEvent.changeText(view.getByPlaceholderText('请描述相关题型的考情。'),'本次考试的完整考情');
 await fireEvent.press(view.getByTestId('feedback-submit'));await waitFor(()=>expect(mockSubmit).toHaveBeenCalledTimes(1));
 expect(mockSubmit.mock.calls[0][0].examDate).toBe(date);
 await fireEvent.press(view.getByTestId('feedback-submit'));await waitFor(()=>expect(mockSubmit).toHaveBeenCalledTimes(2));
 expect(mockSubmit.mock.calls[1][0].clientSubmissionId).toBe(mockSubmit.mock.calls[0][0].clientSubmissionId);
 await fireEvent.changeText(view.getByLabelText('考点名称'),'北京');
 await fireEvent.press(view.getByTestId('feedback-submit'));await waitFor(()=>expect(mockSubmit).toHaveBeenCalledTimes(3));
 expect(mockSubmit.mock.calls[2][0].clientSubmissionId).not.toBe(mockSubmit.mock.calls[1][0].clientSubmissionId);
 await fireEvent.press(view.getByLabelText('考试时间'));await fireEvent.press(view.getByText('清空'));
 expect(view.getByText('选择日期')).toBeTruthy();
 await fireEvent.press(view.getByTestId('feedback-submit'));await waitFor(()=>expect(mockSubmit).toHaveBeenCalledTimes(4));
 expect(mockSubmit.mock.calls[3][0].examDate).toBeUndefined();expect(mockSubmit.mock.calls[3][0].clientSubmissionId).not.toBe(mockSubmit.mock.calls[2][0].clientSubmissionId);
});

it.each(['profile','opi_hotspot'])('does not display exam inputs for %s',async(source)=>{
 mockParams={slug:'feedback',source,compose:'1'};const view=await render(screen());
 expect(view.queryByLabelText('考试时间')).toBeNull();expect(view.queryByLabelText('考点名称')).toBeNull();
});

it('keeps the form usable when the system photo picker fails', async () => {
  jest.mocked(ImagePicker.requestMediaLibraryPermissionsAsync).mockRejectedValueOnce(new Error('picker_unavailable'));
  const view = await render(screen());
  await fireEvent.changeText(view.getByPlaceholderText('请详细描述你的建议或遇到的问题。'), '保留已经填写的建议');
  await fireEvent.press(view.getByLabelText('添加反馈图片'));
  await waitFor(() => expect(view.getByText('暂时无法添加图片，请重试。已填写的内容仍保留。')).toBeTruthy());
  expect(view.getByDisplayValue('保留已经填写的建议')).toBeTruthy();
});

it('keeps failed input and retries the same submission until the user changes its contents', async () => {
  mockSubmit.mockRejectedValue(new Error('offline'));
  const view = await render(screen());
  const field = view.getByPlaceholderText('请详细描述你的建议或遇到的问题。');
  await fireEvent.changeText(field, '这是一条反馈建议');
  await fireEvent.press(view.getByTestId('feedback-submit'));
  await waitFor(() => expect(view.getByText(/你的文字和图片已保留/)).toBeTruthy());
  expect(view.getByDisplayValue('这是一条反馈建议')).toBeTruthy();
  await fireEvent.press(view.getByTestId('feedback-submit'));
  await waitFor(() => expect(mockSubmit).toHaveBeenCalledTimes(2));
  expect(mockSubmit.mock.calls[0][0].clientSubmissionId).toBe(mockSubmit.mock.calls[1][0].clientSubmissionId);
  await fireEvent.changeText(field, '这是一条更新后的建议');
  await fireEvent.press(view.getByTestId('feedback-submit'));
  await waitFor(() => expect(mockSubmit).toHaveBeenCalledTimes(3));
  expect(mockSubmit.mock.calls[2][0].clientSubmissionId).not.toBe(mockSubmit.mock.calls[1][0].clientSubmissionId);
});

it('freezes editing while submitting and ignores a late result after navigating to another question', async () => {
  let resolve!: (result: unknown) => void;
  mockSubmit.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
  const view = await render(screen());
  await fireEvent.changeText(view.getByPlaceholderText('请详细描述你的建议或遇到的问题。'), '这是旧页面反馈内容');
  await fireEvent.press(view.getByTestId('feedback-submit'));
  expect(view.getByDisplayValue('这是旧页面反馈内容').props.editable).toBe(false);
  mockParams = { slug: 'feedback', source: 'study', sourceRoute: '/question-bank/opi/study/category/topic', bankId: 'opi', categoryId: 'category', topicId: 'topic', cardId: 'new-card' };
  await view.rerender(screen());
  expect(mockSubmit.mock.calls[0][0].signal.aborted).toBe(true);
  await act(async () => resolve({ ticketNumber: 'FB-OLD' }));
  expect(view.queryByText('FB-OLD')).toBeNull();
  expect(view.getByPlaceholderText('请描述题目中需要纠正的内容。').props.value).toBe('');
});

it('returns to the existing feedback history after successful submission', async () => {
  mockSubmit.mockResolvedValue({ ticketNumber: 'FB-261022-00000001' });
  const view = await render(screen());
  await fireEvent.changeText(view.getByPlaceholderText('请详细描述你的建议或遇到的问题。'), '这是一条测试反馈');
  await fireEvent.press(view.getByTestId('feedback-submit'));
  await waitFor(() => expect(view.getByText('查看反馈记录')).toBeTruthy());
  await fireEvent.press(view.getByText('查看反馈记录'));
  expect(mockDismissTo).toHaveBeenCalledTimes(1);
  expect(mockDismissTo).toHaveBeenCalledWith('/info/feedback');
});


it('shows one discard confirmation for repeated swipes and permits retry after cancel', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  const view = await render(screen());
  await fireEvent.changeText(view.getByPlaceholderText('请详细描述你的建议或遇到的问题。'), '保留这条反馈');
  const back = jest.mocked(usePreventRemove).mock.calls.at(-1)![1];
  const event = { data: { action: { type: 'GO_BACK' } } };
  await act(async () => { back(event); back(event); });
  expect(alert).toHaveBeenCalledTimes(1);
  await act(async () => alert.mock.calls[0][2]![0].onPress?.());
  await act(async () => back(event));
  expect(alert).toHaveBeenCalledTimes(2);
  expect(view.getByDisplayValue('保留这条反馈')).toBeTruthy();
  alert.mockRestore();
});

it.each([
 {source:'exam_report',category:'opi',placeholder:'请描述相关题型的考情。'},
 {source:'opi_hotspot',category:'opi',placeholder:'请描述你收集到的 OPI 热点题目或线索。'},
])('reuses the form with the correct $source identity and history',async({source,category,placeholder})=>{
 mockParams={slug:'feedback',source,compose:'1'};mockSubmit.mockResolvedValue({ticketNumber:'FB-new'});
 const view=await render(screen());
 expect(view.queryByText('功能建议')).toBeNull();
 if(source==='exam_report') for(const label of ['听力','900句','陆空通话','故事复述','OPI']) expect(view.getByText(label)).toBeTruthy();
 else expect(view.queryByText('反馈类型')).toBeNull();
 await fireEvent.changeText(view.getByPlaceholderText(placeholder),'这是本次考情线索');
 await fireEvent.press(view.getByTestId('feedback-submit'));
 await waitFor(()=>expect(mockSubmit).toHaveBeenCalledWith(expect.objectContaining({source,category})));
 await fireEvent.press(view.getByText('查看反馈记录'));
 expect(mockDismissTo).toHaveBeenCalledWith({pathname:'/info/[slug]',params:{slug:'feedback',source}});
});
