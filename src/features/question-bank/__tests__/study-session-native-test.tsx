import { act, renderHook, waitFor } from '@testing-library/react-native';
import data from '../data/question-bank.json';
import { useStudySession } from '../hooks/useStudySession.native';
import { toStudyReviewPackage } from '../lib/study-review.native';
import type { LearningStore } from '../platform/learning-store.native';
import type { LearningRecord, QuestionBankDataset, QuestionBankStudyItem, QuestionBankStudyPackage } from '../types';
jest.mock('../recording/recording-repository', () => ({ recordingRepository: { cleanupSession: jest.fn(), discard: jest.fn() } }));
const dataset = data[0] as QuestionBankDataset;
const category = dataset.categories[0];
const topic = { ...category.topics[0], cards: category.topics[0].cards.slice(0, 3) };
function store(): LearningStore { return { getCardState: jest.fn(), getTopicStates: jest.fn(async () => ({})), saveCardState: jest.fn(async () => undefined), getRecords: jest.fn(async () => []), addRecord: jest.fn(async () => undefined) }; }
it('saves an AI recovery parent without ending study, then serializes final save under the same history id', async () => {
  const persistence = store();
  const hook = await renderHook(() => useStudySession({ dataset, category, topic, store: persistence }));
  await waitFor(() => expect(hook.result.current.cardState?.visited).toBe(true));
  let release!: () => void;
  jest.mocked(persistence.addRecord).mockImplementationOnce(() => new Promise<void>(resolve => { release = resolve; }));
  await act(async () => hook.result.current.updateAnswer('AI input'));
  let checkpoint!: Promise<void>;
  await act(async () => { checkpoint = hook.result.current.saveCheckpoint(); });
  expect(hook.result.current.report).toBeUndefined();
  await act(async () => hook.result.current.updateAnswer('final edited answer'));
  let final!: Promise<LearningRecord | undefined>;
  await act(async () => { final = hook.result.current.finish('abort'); });
  expect(persistence.addRecord).toHaveBeenCalledTimes(1);
  await act(async () => { release(); await checkpoint; await final; });
  const [first, second] = jest.mocked(persistence.addRecord).mock.calls.map(call => call[0]);
  expect(first.id).toBe(second.id); expect(first.studyReview?.answers[topic.cards[0].id]).toBe('AI input');
  expect(second.studyReview?.answers[topic.cards[0].id]).toBe('final edited answer'); expect(hook.result.current.report).toBe(second);
});
it('does not import old answers; opening/read-only study counts as studied and captures only encountered questions', async () => {
  const persistence = store();
  jest.mocked(persistence.getTopicStates).mockResolvedValue({ [topic.cards[0].id]: { visited: true, completed: true, selectedChoiceIndex: 1, note: '', updatedAt: '2026-08-01T00:00:00.000Z' } });
  const hook = await renderHook(() => useStudySession({ dataset, category, topic, store: persistence }));
  await waitFor(() => expect(hook.result.current.cardState?.visited).toBe(true));
  expect(hook.result.current.cardState?.selectedChoiceIndex).toBeUndefined();
  await act(async () => { await hook.result.current.finish('abort'); });
  const saved = jest.mocked(persistence.addRecord).mock.calls[0][0];
  expect(saved.studyReview?.items).toHaveLength(1);
  expect(saved.answeredCount).toBe(0); expect(saved.studiedCount).toBe(1);
  expect(saved.studyReview?.states[topic.cards[0].id]?.selectedChoiceIndex).toBeUndefined();
  expect(jest.mocked(persistence.saveCardState).mock.calls[0][2].completed).toBe(true);
});
it('seals one idempotent history and readonly replay cannot mutate or create another session', async () => {
  const persistence = store();
  const hook = await renderHook(() => useStudySession({ dataset, category, topic, store: persistence }));
  await waitFor(() => expect(hook.result.current.cardState?.visited).toBe(true));
  await act(async () => { hook.result.current.chooseOption(0); hook.result.current.updateAnswer('my answer'); });
  let saved: LearningRecord | undefined;
  await act(async () => { [saved] = await Promise.all([hook.result.current.finish('abort'), hook.result.current.finish('abort')]); });
  expect(persistence.addRecord).toHaveBeenCalledTimes(1);
  expect(saved?.studyReview?.answers[topic.cards[0].id]).toBe('my answer');
  await hook.unmount();
  const readonlyStore = store(); const studyPackage = toStudyReviewPackage(saved!)!;
  const review = await renderHook(() => useStudySession({ studyPackage, store: readonlyStore }));
  await waitFor(() => expect(review.result.current.hydrated).toBe(true));
  await act(async () => { review.result.current.chooseOption(1); review.result.current.updateAnswer('changed'); await review.result.current.finish('complete'); });
  expect(review.result.current.answerText).toBe('my answer');
  expect(review.result.current.cardState?.selectedChoiceIndex).toBe(0);
  expect(readonlyStore.addRecord).not.toHaveBeenCalled(); expect(readonlyStore.saveCardState).not.toHaveBeenCalled();
});
it('a formally started mock saves the entire paper including unvisited and unanswered questions', async () => {
  const persistence = store();
  const studyPackage: QuestionBankStudyPackage = { id: 'exam-1', startedAt: new Date().toISOString(), progressMode: 'session-only', items: topic.cards.map(card => ({ id: card.id, dataset, category, topic, card })), record: { bankId: 'mock_exam', bankTitle: '模拟考试', categoryTitle: 'ICAO 4 初考', topicTitle: '听力', recordType: 'mock_exam' } };
  const hook = await renderHook(() => useStudySession({ studyPackage, store: persistence }));
  await waitFor(() => expect(hook.result.current.hydrated).toBe(true));
  await act(async () => { await hook.result.current.finish('abort'); });
  const saved = jest.mocked(persistence.addRecord).mock.calls[0][0];
  expect(saved.studyReview?.items).toHaveLength(3); expect(saved.answeredCount).toBe(0); expect(saved.reason).toBe('abort');
  expect(persistence.saveCardState).not.toHaveBeenCalled();
});
it('load failure creates no empty history and retrying persistence reuses the same report id', async () => {
  const persistence = store(); jest.mocked(persistence.getTopicStates).mockRejectedValueOnce(new Error('unavailable'));
  const hook = await renderHook(() => useStudySession({ dataset, category, topic, store: persistence }));
  await waitFor(() => expect(hook.result.current.loadError).toBeTruthy());
  await act(async () => { await hook.result.current.finish('abort'); });
  expect(persistence.addRecord).not.toHaveBeenCalled();
  await act(() => hook.result.current.retryHydration());
  await waitFor(() => expect(hook.result.current.cardState?.visited).toBe(true));
  jest.mocked(persistence.addRecord).mockRejectedValueOnce(new Error('disk_full'));
  await act(async () => { await expect(hook.result.current.finish('abort')).rejects.toThrow('disk_full'); });
  await act(async () => { await hook.result.current.finish('abort'); });
  expect(jest.mocked(persistence.addRecord).mock.calls[0][0].id).toBe(jest.mocked(persistence.addRecord).mock.calls[1][0].id);
});

function examPaper(mixed = true): QuestionBankStudyPackage {
  const cards = Array.from({ length: 20 }, (_, index) => ({ id: `listen-${index}`, taskTitle: '听力', audioText: 'Question', choices: ['A', 'B'], correctChoiceIndex: 0 }));
  const listeningTopic = { ...topic, cards };
  const items: QuestionBankStudyItem[] = cards.map(card => ({ id: `attempt-${card.id}`, dataset, category, topic: listeningTopic, card }));
  if (mixed) items.push({ ...items[0], id: 'attempt-opi-1', dataset: { ...dataset, id: 'opi' }, card: { ...items[0].card, id: 'opi-1', choices: undefined, correctChoiceIndex: undefined } });
  return { id: 'fixed-exam', startedAt: '2026-09-09T00:00:00.000Z', progressMode: 'session-only', items, record: { id: 'fixed-record', recordType: 'mock_exam', bankId: 'mock_exam', bankTitle: '模拟考试', categoryTitle: 'ICAO 4 初考', topicTitle: '听力、OPI', mockExam: { examType: 'icao4-first', mode: 'custom', moduleIds: mixed ? ['listening', 'opi'] : ['listening'], sectionCounts: [] } } };
}
it('locks previous questions and tools, permits unanswered forward, and publishes listening only after formal submission of question 20', async () => {
  const persistence = store();
  const paper = examPaper();
  const hook = await renderHook(() => useStudySession({ studyPackage: paper, store: persistence }));
  await waitFor(() => expect(hook.result.current.hydrated).toBe(true));
  await act(() => { hook.result.current.goTo(4); hook.result.current.revealCurrent(); hook.result.current.setToolMode('highlight'); });
  expect(hook.result.current.currentIndex).toBe(0); expect(hook.result.current.revealed).toBe(false); expect(hook.result.current.toolMode).toBeUndefined();
  let premature: LearningRecord | undefined;
  await act(async () => { premature = await hook.result.current.saveListeningResult(); });
  expect(premature).toBeUndefined(); expect(persistence.addRecord).not.toHaveBeenCalled();
  const oldChoose = hook.result.current.chooseOption;
  for (let index = 0; index < 20; index += 1) {
    if (index % 2 === 0) await act(() => hook.result.current.chooseOption(0));
    if (index < 19) await act(() => hook.result.current.goTo(index + 1));
  }
  expect(hook.result.current.currentIndex).toBe(19);
  await act(() => { hook.result.current.goTo(0); hook.result.current.goTo(20); oldChoose(1); });
  expect(hook.result.current.currentIndex).toBe(19); expect(hook.result.current.states['attempt-listen-0'].selectedChoiceIndex).toBe(0);
  expect(hook.result.current.revealed).toBe(false);
  let checkpoint: LearningRecord | undefined;
  await act(async () => { checkpoint = await hook.result.current.saveListeningResult(); });
  expect(checkpoint?.mockExam?.listeningResult).toEqual({ answeredCount: 10, correctCount: 10, score: 25, level: 4, totalCount: 20 });
  await act(() => { hook.result.current.chooseOption(0); hook.result.current.goTo(20); });
  expect(hook.result.current.currentIndex).toBe(20); expect(hook.result.current.states['attempt-listen-19']?.selectedChoiceIndex).toBeUndefined();
  await act(async () => { await hook.result.current.finish('abort'); });
  const final = hook.result.current.report!;
  expect(final.id).toBe(checkpoint!.id); expect(final.sessionId).toBe(checkpoint!.sessionId);
  expect(final.mockExam?.listeningResult).toEqual(checkpoint!.mockExam!.listeningResult);
  expect(final.reason).toBe('abort'); expect(final.studyReview?.items).toHaveLength(21); expect(final.answeredCount).toBe(10);
});
it('early listening termination omits a grade; formally submitting 20 unanswered questions yields a complete zero-score result', async () => {
  const paper = examPaper(false); const earlyStore = store(); const fullStore = store();
  const early = await renderHook(() => useStudySession({ studyPackage: paper, store: earlyStore }));
  await waitFor(() => expect(early.result.current.hydrated).toBe(true));
  await act(async () => { early.result.current.chooseOption(0); await early.result.current.finish('abort'); });
  expect(early.result.current.report?.mockExam?.listeningResult).toBeUndefined();
  expect(early.result.current.report?.reason).toBe('abort'); await early.unmount();
  const full = await renderHook(() => useStudySession({ studyPackage: paper, store: fullStore }));
  await waitFor(() => expect(full.result.current.hydrated).toBe(true));
  for (let index = 1; index < 20; index += 1) await act(() => full.result.current.goTo(index));
  await act(async () => { await full.result.current.saveListeningResult(); await full.result.current.finish('complete'); });
  expect(full.result.current.report?.mockExam?.listeningResult).toMatchObject({ score: 0, answeredCount: 0, level: 2 });
  expect(full.result.current.report?.reason).toBe('complete');
});
