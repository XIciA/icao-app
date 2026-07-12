import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { Pressable, Text, View } from 'react-native';

import { useStudySession } from '../hooks/useStudySession';
import type { LearningStore } from '../platform/learning-store';
import type { QuestionBankCategory, QuestionBankDataset, QuestionBankTopic } from '../types';

const topic: QuestionBankTopic = {
  id: 'topic', name: 'Topic', declaredCardCount: 2,
  cards: [
    { id: 'a', taskTitle: 'A', audioText: 'Alpha' },
    { id: 'b', taskTitle: 'B', audioText: 'Bravo' },
  ],
};
const category: QuestionBankCategory = { id: 'category', name: 'Category', declaredTopicCount: 1, declaredCardCount: 2, topics: [topic] };
const dataset: QuestionBankDataset = {
  id: 'sentences900', title: '900句', nameEn: 'Sentences', description: '', summary: '', enabled: true, statusLabel: '', icon: 'sentences', declaredTopicCount: 1, declaredCardCount: 2, categoryUnit: '类', topicUnit: '组', cardUnit: '句', categories: [category],
  study: { interaction: 'speaking', tools: { recorder: true, choices: false, notes: true, dictionary: true, highlights: true, tags: true }, copy: { transcriptLabel: '音频原文', referenceLabel: '参考答案' }, audioTitlePattern: 'card-title', consoleTabs: ['mine', 'notes'] },
};

function createStore(): LearningStore {
  return {
    getCardState: jest.fn(async () => undefined),
    getTopicStates: jest.fn(async () => ({})),
    saveCardState: jest.fn(async () => undefined),
    addRecord: jest.fn(async () => undefined),
    getRecords: jest.fn(async () => []),
  };
}

function Harness({ store }: { store: LearningStore }) {
  const session = useStudySession({ dataset, category, topic, store });
  if (!session.hydrated) return <Text>loading</Text>;
  return (
    <View>
      <Text>{`index:${session.currentIndex}`}</Text>
      <Text>{`visited:${session.visitedIndexes.size}`}</Text>
      <Text>{`completed:${session.completedCardIds.size}`}</Text>
      <Text>{`revealed:${session.revealed}`}</Text>
      <Text>{`tool:${session.toolMode ?? 'none'}`}</Text>
      <Pressable accessibilityLabel="next" onPress={() => session.goTo(1)} />
      <Pressable accessibilityLabel="previous" onPress={() => session.goTo(0)} />
      <Pressable accessibilityLabel="answer" onPress={session.toggleAnswers} />
      <Pressable accessibilityLabel="dictionary" onPress={() => session.setToolMode('dictionary')} />
      <Pressable accessibilityLabel="clear-tool" onPress={() => session.setToolMode(undefined)} />
    </View>
  );
}

describe('useStudySession', () => {
  it('keeps visits separate from completion and carries auto reveal across navigation', async () => {
    const store = createStore();
    const screen = await render(<Harness store={store} />);
    await waitFor(() => expect(screen.getByText('index:0')).toBeTruthy());
    expect(screen.getByText('completed:0')).toBeTruthy();

    await fireEvent.press(screen.getByLabelText('next'));
    await waitFor(() => expect(screen.getByText('visited:2')).toBeTruthy());
    expect(screen.getByText('completed:0')).toBeTruthy();

    await fireEvent.press(screen.getByLabelText('answer'));
    await waitFor(() => expect(screen.getByText('completed:1')).toBeTruthy());
    expect(screen.getByText('revealed:true')).toBeTruthy();

    await fireEvent.press(screen.getByLabelText('previous'));
    await waitFor(() => expect(screen.getByText('completed:2')).toBeTruthy());
    expect(screen.getByText('revealed:true')).toBeTruthy();
  });

  it('sets and clears a tool mode without toggling a different callback back off', async () => {
    const screen = await render(<Harness store={createStore()} />);
    await waitFor(() => expect(screen.getByText('tool:none')).toBeTruthy());
    fireEvent.press(screen.getByLabelText('dictionary'));
    await waitFor(() => expect(screen.getByText('tool:dictionary')).toBeTruthy());
    fireEvent.press(screen.getByLabelText('clear-tool'));
    await waitFor(() => expect(screen.getByText('tool:none')).toBeTruthy());
  });
});
