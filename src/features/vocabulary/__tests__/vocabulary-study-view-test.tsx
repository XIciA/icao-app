import { fireEvent, render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { stopVocabularySpeech } from '../speech';
import { VocabularyStudyView } from '../components/VocabularyStudyViews';
import type { VocabularyState, VocabularyWord } from '../types';

jest.mock('lucide-react-native', () => {
  const { View } = jest.requireActual('react-native');
  const Icon = (props: object) => <View {...props} />;
  return new Proxy({}, { get: () => Icon });
});
jest.mock('../speech', () => ({
  speakVocabulary: jest.fn(async () => true),
  speakVocabularyWithFeedback: jest.fn(async () => true),
  stopVocabularySpeech: jest.fn(async () => undefined),
}));

const word: VocabularyWord = {
  id: 'preview-0001',
  bookId: 'preview',
  level: 1,
  word: 'deviation',
  meaning: 'n. 偏离',
  example: 'Report any deviation.',
  exampleTranslation: '报告任何偏离。',
  source: { name: 'test', rowIndex: 1, sourceNo: 1 },
};
const state: VocabularyState = { schemaVersion: 1, words: {}, updatedAt: new Date(0).toISOString() };

function renderStudy(width: number, onExit = jest.fn()) {
  return render(
    <SafeAreaProvider initialMetrics={{ frame: { height: 812, width, x: 0, y: 0 }, insets: { bottom: 34, left: 0, right: 0, top: 47 } }}>
      <VocabularyStudyView
        index={0}
        onChoose={jest.fn()}
        onExit={onExit}
        onNext={jest.fn()}
        onToggleFavorite={jest.fn()}
        onWrong={jest.fn()}
        revealed={false}
        state={state}
        words={[word]}
      />
    </SafeAreaProvider>,
  );
}

describe('VocabularyStudyView', () => {
  it('uses a working back action without an exit confirmation', async () => {
    const onExit = jest.fn();
    const screen = await renderStudy(375, onExit);

    fireEvent.press(screen.getByLabelText('返回上一页'));

    expect(stopVocabularySpeech).toHaveBeenCalled();
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it.each([360, 375, 390, 430])('keeps the back and favorite actions at %ipx', async (width) => {
    const screen = await renderStudy(width);

    expect(screen.getByLabelText('返回上一页')).toBeTruthy();
    expect(screen.getByLabelText('收藏')).toBeTruthy();
  });
});
