import { fireEvent, render } from '@testing-library/react-native';
import { RadioSubtitles } from '../RadioSubtitles';
import type { RadioTrack } from '../types';
jest.mock('@/features/question-bank/components/ImageQuestionCard', () => ({ ImageQuestionCard: ({ imageAlt }: { imageAlt: string }) => { const { Text } = jest.requireActual('react-native'); return <Text>{imageAlt}</Text>; } }));
jest.mock('../RadioImageThumbnail', () => ({ RadioImageThumbnail: ({ onPress }: { onPress: () => void }) => { const { Pressable, Text } = jest.requireActual('react-native'); return <Pressable accessibilityLabel="查看题目大图" onPress={onPress}><Text>题目图片</Text></Pressable>; } }));
jest.mock('react-native-safe-area-context', () => ({ ...jest.requireActual('react-native-safe-area-context/jest/mock').default, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
const track: RadioTrack = { id: 'q', bankId: 'opi', bankTitle: 'OPI', categoryId: 'c', categoryTitle: 'C', topicId: 't', topicTitle: 'T', title: 'Q', audioText: 'Question?', audioTextZh: '问题？', referenceLabel: '参考答案', referenceText: 'Answer.', referenceTextZh: '答案。', durationSeconds: 3, stableIndex: 0, audioPath: '/q.mp3' };

it('shows both original and answer with both translations in bilingual mode', async () => {
  const screen = await render(<RadioSubtitles mode="bilingual" track={track} />);
  for (const text of ['音频原文', 'Question?', '问题？', '参考答案', 'Answer.', '答案。']) expect(screen.getByText(text)).toBeTruthy();
});
it('hides both translations in English mode and all text when off', async () => {
  const screen = await render(<RadioSubtitles mode="english" track={track} />);
  expect(screen.getByText('Question?')).toBeTruthy(); expect(screen.getByText('Answer.')).toBeTruthy();
  expect(screen.queryByText('问题？')).toBeNull(); expect(screen.queryByText('答案。')).toBeNull();
  await screen.rerender(<RadioSubtitles mode="off" track={track} />);
  expect(screen.queryByText('Question?')).toBeNull(); expect(screen.queryByText('Answer.')).toBeNull();
});
it('does not add an empty answer section for a sentence or story', async () => {
  const screen = await render(<RadioSubtitles mode="bilingual" track={{ ...track, bankId: 'sentences900', referenceLabel: undefined, referenceText: undefined, referenceTextZh: undefined }} />);
  expect(screen.getByText('Question?')).toBeTruthy(); expect(screen.queryByText('参考答案')).toBeNull();
});
it('opens the source image without leaving the player', async () => {
  const screen = await render(<RadioSubtitles mode="bilingual" track={{ ...track, materials: [{ image: '/image.jpg', imageAlt: 'Source aircraft photo' }] }} />);
  expect(screen.queryByText('Source aircraft photo')).toBeNull();
  await fireEvent.press(screen.getByLabelText('查看题目大图'));
  expect(screen.getByText('Source aircraft photo')).toBeTruthy();
  await fireEvent.press(screen.getByText('关闭图片'));
  expect(screen.queryByText('Source aircraft photo')).toBeNull();
});
it('handles missing answers and translations without borrowing text from another question', async () => {
  const screen = await render(<RadioSubtitles mode="bilingual" track={{ ...track, referenceTextZh: undefined }} />);
  expect(screen.getByText('当前参考答案暂无中文译文。')).toBeTruthy();
  await screen.rerender(<RadioSubtitles mode="bilingual" track={{ ...track, referenceText: undefined }} />);
  expect(screen.getByText('当前题目暂无参考答案。')).toBeTruthy(); expect(screen.queryByText('答案。')).toBeNull();
});
