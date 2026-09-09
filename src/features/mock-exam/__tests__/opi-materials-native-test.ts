import data from '@/features/question-bank/data/question-bank.json';
import { captureStudyReview } from '@/features/question-bank/lib/study-review.native';
import { withStudyMaterials } from '@/features/question-bank/lib/study-materials.native';
import { questionBankRepository } from '@/features/question-bank/data/repository.native';
import type { QuestionBankDataset, QuestionBankTopic } from '@/features/question-bank/types';
import { buildMockExamSession, toQuestionBankStudyPackage } from '../build-session.native';

jest.mock('@/features/question-bank/data/repository.native', () => ({ questionBankRepository: { getDataset: jest.fn() } }));

const original = data.find((bank) => bank.id === 'opi') as QuestionBankDataset;
const image = { id: 'source-image', kind: 'image' as const, taskTitle: '观察图片', image: '/assets/question.jpg', imageAlt: 'Aircraft on runway' };
function topic(id: string, count: number): QuestionBankTopic {
  return { id, name: id, declaredCardCount: count + 1, cards: [image, ...Array.from({ length: count }, (_, index) => ({ id: `${id}-${index}`, taskTitle: `Question ${index}`, audioText: `Question ${index}` }))] };
}
function dataset(topics: QuestionBankTopic[]): QuestionBankDataset {
  return { ...original, categories: [{ ...original.categories[0], topics }] };
}

it('counts five real OPI questions, preserves their associated picture, and captures only that necessary material', async () => {
  jest.mocked(questionBankRepository.getDataset).mockResolvedValue(dataset([topic('five-questions', 5), topic('four-questions', 4)]));
  const session = await buildMockExamSession({ examType: 'icao4-first', modules: ['opi'] }, 1);
  expect(session.items).toHaveLength(5);
  expect(session.items.every((item) => item.card.kind !== 'image' && item.topic.id === 'five-questions')).toBe(true);
  const paper = toQuestionBankStudyPackage(session);
  expect(paper.items.map(withStudyMaterials).every((item) => item.materials?.[0].id === image.id)).toBe(true);
  const snapshot = captureStudyReview(paper.items, {}, {});
  expect(snapshot?.items).toHaveLength(5);
  expect(snapshot?.items.every((item) => item.materials?.[0].image === image.image && item.topic.cards.length === 0)).toBe(true);
  expect(snapshot?.items.map(withStudyMaterials)).toEqual(snapshot?.items);
});

it('does not substitute a picture for a missing fifth question', async () => {
  jest.mocked(questionBankRepository.getDataset).mockResolvedValue(dataset([topic('four-questions', 4)]));
  await expect(buildMockExamSession({ examType: 'icao4-first', modules: ['opi'] }, 1)).rejects.toThrow('5 道问答');
});
