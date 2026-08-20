import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Pressable, Text, View } from 'react-native';

import { useStudySession } from '../hooks/useStudySession';
import type { LearningStore } from '../platform/learning-store';
import type { RecordingAsset } from '../recording/types';
import type {
  QuestionBankCategory,
  QuestionBankDataset,
  QuestionBankStudyPackage,
  QuestionBankTopic,
} from '../types';

jest.mock('../recording/recording-repository', () => ({
  recordingRepository: {
    cleanupSession: jest.fn(),
    discard: jest.fn(),
  },
}));

const { recordingRepository: mockRecordingRepository } = jest.requireMock('../recording/recording-repository') as {
  recordingRepository: { cleanupSession: jest.Mock; discard: jest.Mock };
};

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

const listeningTopic: QuestionBankTopic = {
  id: 'listening-topic', name: 'Listening topic', declaredCardCount: 1,
  cards: [
    { id: 'a', taskTitle: 'Listening A', audioText: 'Question', choices: ['No', 'Yes'], correctChoiceIndex: 1 },
  ],
};
const listeningCategory: QuestionBankCategory = {
  id: 'listening-category', name: 'Listening category', declaredTopicCount: 1, declaredCardCount: 1, topics: [listeningTopic],
};
const listeningDataset: QuestionBankDataset = {
  id: 'listening', title: '听力', nameEn: 'Listening', description: '', summary: '', enabled: true, statusLabel: '', icon: 'headphones', declaredTopicCount: 1, declaredCardCount: 1, categoryUnit: '类', topicUnit: '组', cardUnit: '题', categories: [listeningCategory],
  study: { interaction: 'choices', tools: { recorder: false, choices: true, notes: true, dictionary: false, highlights: false, tags: true }, copy: { transcriptLabel: '听力原文', referenceLabel: '答案' }, audioTitlePattern: 'card-title', consoleTabs: ['reference', 'notes'] },
};

function studyPackage(progressMode: QuestionBankStudyPackage['progressMode'] = 'session-only'): QuestionBankStudyPackage {
  return {
    id: 'mock-package-1',
    startedAt: new Date().toISOString(),
    progressMode,
    items: [
      { id: 'speaking-item', dataset, category, topic, card: topic.cards[0], sectionId: 'sentences900', sectionTitle: '900 句' },
      { id: 'listening-item', dataset: listeningDataset, category: listeningCategory, topic: listeningTopic, card: listeningTopic.cards[0], sectionId: 'listening', sectionTitle: '听力' },
    ],
    record: {
      id: 'mock-record-1',
      bankId: 'mock_exam',
      bankTitle: 'AI 模考',
      categoryTitle: 'ICAO 4 初考',
      topicTitle: '完整模考',
      recordType: 'mock_exam',
      mockExam: {
        examType: 'icao4-first',
        mode: 'complete',
        moduleIds: ['sentences900', 'listening'],
        sectionCounts: [
          { id: 'sentences900', title: '900 句', total: 1 },
          { id: 'listening', title: '听力', total: 1 },
        ],
      },
    },
  };
}

function recording(id: string): RecordingAsset {
  return {
    id,
    sessionId: 'test-session',
    cardId: 'a',
    uri: `file:///recordings/${id}.wav`,
    format: 'wav',
    mimeType: 'audio/wav',
    durationMillis: 1_200,
    byteSize: 32_044,
    createdAt: '2026-07-16T00:00:00.000Z',
    storageKind: 'native-file',
  };
}

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
      <Text>{`active-tab:${session.activeTab}`}</Text>
      <Text>{`recording:${session.recording?.id ?? 'none'}`}</Text>
      <Text>{`tool:${session.toolMode ?? 'none'}`}</Text>
      <Text>{`play-request:${session.playRequestToken}`}</Text>
      <Pressable accessibilityLabel="next" onPress={() => session.goTo(1)} />
      <Pressable accessibilityLabel="previous" onPress={() => session.goTo(0)} />
      <Pressable accessibilityLabel="answer" onPress={session.toggleAnswers} />
      <Pressable accessibilityLabel="dictionary" onPress={() => session.setToolMode('dictionary')} />
      <Pressable accessibilityLabel="tags" onPress={() => session.setToolMode('tags')} />
      <Pressable accessibilityLabel="clear-tool" onPress={() => session.setToolMode(undefined)} />
      <Pressable accessibilityLabel="finish" onPress={() => { void session.finish('complete').catch(() => undefined); }} />
      <Pressable accessibilityLabel="record" onPress={() => session.recordAnswer(recording('asset-1'))} />
      <Pressable accessibilityLabel="replace-recording" onPress={() => session.recordAnswer(recording('asset-2'))} />
      <Pressable accessibilityLabel="clear-recording" onPress={session.clearRecording} />
    </View>
  );
}

function PackageHarness({ packageValue, store }: { packageValue: QuestionBankStudyPackage; store: LearningStore }) {
  const session = useStudySession({ studyPackage: packageValue, store });
  if (!session.hydrated) return <Text>loading</Text>;
  return (
    <View>
      <Text>{`item:${session.item?.id ?? 'none'}`}</Text>
      <Text>{`task:${session.behavior.taskKind}`}</Text>
      <Text>{`tab:${session.activeTab}`}</Text>
      <Text>{`completed:${session.completedCardIds.size}`}</Text>
      <Text>{`state-keys:${Object.keys(session.states).sort().join(',')}`}</Text>
      <Pressable accessibilityLabel="package-next" onPress={() => session.goTo(1)} />
      <Pressable accessibilityLabel="package-record" onPress={() => session.recordAnswer(recording('package-recording'))} />
      <Pressable accessibilityLabel="package-choose" onPress={() => session.chooseOption(1)} />
      <Pressable accessibilityLabel="package-finish" onPress={() => { void session.finish('complete').catch(() => undefined); }} />
    </View>
  );
}

describe('useStudySession', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

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

  it('requests autoplay on the first card and after every successful navigation', async () => {
    const screen = await render(<Harness store={createStore()} />);
    await waitFor(() => expect(screen.getByText('play-request:1')).toBeTruthy());

    fireEvent.press(screen.getByLabelText('next'));
    await waitFor(() => expect(screen.getByText('play-request:2')).toBeTruthy());

    fireEvent.press(screen.getByLabelText('previous'));
    await waitFor(() => expect(screen.getByText('play-request:3')).toBeTruthy());
  });

  it('sets and clears a tool mode without toggling a different callback back off', async () => {
    const screen = await render(<Harness store={createStore()} />);
    await waitFor(() => expect(screen.getByText('tool:none')).toBeTruthy());
    fireEvent.press(screen.getByLabelText('dictionary'));
    await waitFor(() => expect(screen.getByText('tool:dictionary')).toBeTruthy());
    fireEvent.press(screen.getByLabelText('clear-tool'));
    await waitFor(() => expect(screen.getByText('tool:none')).toBeTruthy());
    await fireEvent.press(screen.getByLabelText('tags'));
    await waitFor(() => expect(screen.getByText('tool:tags')).toBeTruthy());
    await fireEvent.press(screen.getByLabelText('next'));
    await waitFor(() => expect(screen.getByText('tool:none')).toBeTruthy());
  });

  it('reuses one stable session report id when finishing is retried', async () => {
    const store = createStore();
    (store.addRecord as jest.Mock).mockRejectedValueOnce(new Error('sync_failed')).mockResolvedValueOnce(undefined);
    const screen = await render(<Harness store={store} />);
    await waitFor(() => expect(screen.getByText('index:0')).toBeTruthy());

    await act(async () => { fireEvent.press(screen.getByLabelText('finish')); await Promise.resolve(); });
    await waitFor(() => expect(store.addRecord).toHaveBeenCalledTimes(1));
    await act(async () => { fireEvent.press(screen.getByLabelText('finish')); await Promise.resolve(); });
    await waitFor(() => expect(store.addRecord).toHaveBeenCalledTimes(2));

    const first = (store.addRecord as jest.Mock).mock.calls[0][0];
    const second = (store.addRecord as jest.Mock).mock.calls[1][0];
    expect(first.id).toBe(second.id);
    expect(second).toMatchObject({ schemaVersion: 3, recordType: 'session', sessionId: expect.any(String) });
  });

  it('publishes a committed recording before independent consumers and atomically replaces it', async () => {
    const screen = await render(<Harness store={createStore()} />);
    await waitFor(() => expect(screen.getByText('recording:none')).toBeTruthy());

    fireEvent.press(screen.getByLabelText('record'));
    await waitFor(() => expect(screen.getByText('recording:asset-1')).toBeTruthy());
    expect(screen.getByText('revealed:true')).toBeTruthy();
    expect(screen.getByText('active-tab:mine')).toBeTruthy();
    expect(screen.getByText('completed:1')).toBeTruthy();
    expect(mockRecordingRepository.discard).not.toHaveBeenCalled();

    fireEvent.press(screen.getByLabelText('replace-recording'));
    await waitFor(() => expect(screen.getByText('recording:asset-2')).toBeTruthy());
    expect(mockRecordingRepository.discard).toHaveBeenCalledTimes(1);
    expect(mockRecordingRepository.discard).toHaveBeenCalledWith(expect.objectContaining({ id: 'asset-1' }));

    fireEvent.press(screen.getByLabelText('clear-recording'));
    await waitFor(() => expect(screen.getByText('recording:none')).toBeTruthy());
    expect(mockRecordingRepository.discard).toHaveBeenCalledWith(expect.objectContaining({ id: 'asset-2' }));
  });

  it('switches behavior from each current study item dataset', async () => {
    const screen = await render(<PackageHarness packageValue={studyPackage()} store={createStore()} />);
    await waitFor(() => expect(screen.getByText('item:speaking-item')).toBeTruthy());
    expect(screen.getByText('task:recording')).toBeTruthy();
    expect(screen.getByText('tab:mine')).toBeTruthy();

    fireEvent.press(screen.getByLabelText('package-next'));
    await waitFor(() => expect(screen.getByText('item:listening-item')).toBeTruthy());
    expect(screen.getByText('task:choices')).toBeTruthy();
    expect(screen.getByText('tab:notes')).toBeTruthy();
  });

  it('keeps session-only package progress in item-keyed memory without progress reads or writes', async () => {
    const store = createStore();
    const screen = await render(<PackageHarness packageValue={studyPackage()} store={store} />);
    await waitFor(() => expect(screen.getByText('item:speaking-item')).toBeTruthy());
    expect(store.getCardState).not.toHaveBeenCalled();
    expect(store.getTopicStates).not.toHaveBeenCalled();

    fireEvent.press(screen.getByLabelText('package-record'));
    await waitFor(() => expect(screen.getByText('state-keys:speaking-item')).toBeTruthy());
    fireEvent.press(screen.getByLabelText('package-next'));
    await waitFor(() => expect(screen.getByText('item:listening-item')).toBeTruthy());
    fireEvent.press(screen.getByLabelText('package-choose'));
    await waitFor(() => expect(screen.getByText('state-keys:listening-item,speaking-item')).toBeTruthy());

    expect(store.saveCardState).not.toHaveBeenCalled();
    expect(store.getCardState).not.toHaveBeenCalled();
    expect(store.getTopicStates).not.toHaveBeenCalled();
  });

  it('creates one package mock-exam record with descriptor metadata and dynamic counts', async () => {
    const store = createStore();
    const packageValue = studyPackage();
    const screen = await render(<PackageHarness packageValue={packageValue} store={store} />);
    await waitFor(() => expect(screen.getByText('item:speaking-item')).toBeTruthy());

    fireEvent.press(screen.getByLabelText('package-record'));
    await waitFor(() => expect(screen.getByText('completed:1')).toBeTruthy());
    fireEvent.press(screen.getByLabelText('package-next'));
    await waitFor(() => expect(screen.getByText('item:listening-item')).toBeTruthy());
    fireEvent.press(screen.getByLabelText('package-choose'));
    await waitFor(() => expect(screen.getByText('completed:2')).toBeTruthy());
    await act(async () => { fireEvent.press(screen.getByLabelText('package-finish')); await Promise.resolve(); });
    await waitFor(() => expect(store.addRecord).toHaveBeenCalledTimes(1));

    expect(store.addRecord).toHaveBeenCalledWith(expect.objectContaining({
      id: 'mock-record-1',
      sessionId: packageValue.id,
      bankId: 'mock_exam',
      bankTitle: 'AI 模考',
      categoryTitle: 'ICAO 4 初考',
      topicTitle: '完整模考',
      recordType: 'mock_exam',
      mockExam: packageValue.record.mockExam,
      completedCount: 2,
      totalCount: 2,
      correctCount: 1,
      reason: 'complete',
      durationSeconds: expect.any(Number),
    }));

    await act(async () => { fireEvent.press(screen.getByLabelText('package-finish')); await Promise.resolve(); });
    await waitFor(() => expect(store.addRecord).toHaveBeenCalledTimes(1));
    expect(mockRecordingRepository.cleanupSession).toHaveBeenCalledWith(packageValue.id);
  });
});
