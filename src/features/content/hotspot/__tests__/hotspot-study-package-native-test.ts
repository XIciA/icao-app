import data from '@/features/question-bank/data/question-bank.json';
import { captureStudyReview } from '@/features/question-bank/lib/study-review.native';
import type { QuestionBankDataset } from '@/features/question-bank/types';
import { buildHotspotStudyPackage } from '../build-hotspot-study-package.native';
import { resolveHotspotTopics } from '../resolve-hotspot-topics.native';
import { loadHotspotBriefs } from '../repository';
import type { OpiHotspotBrief } from '../types';

const dataset = (data as QuestionBankDataset[]).find(bank => bank.id === 'opi')!;
it('keeps fixed selections from every current issue attached to the original topic and category', () => {
  for (const brief of loadHotspotBriefs()) {
    const paper = buildHotspotStudyPackage(brief, dataset);
    expect(paper.items.map(item => item.card.id)).toEqual(brief.topics.flatMap(topic => topic.cardIds));
    expect(paper.items.every(item => dataset.categories.some(category => category.id === item.category.id && category.topics.some(topic => topic.id === item.topic.id && topic.cards.includes(item.card))))).toBe(true);
    expect(paper.progressMode).toBe('persistent'); expect(paper.record.hotspot?.id).toBe(brief.id);
  }
});
it('supports existing OPI picture-topic questions and retains their image when only the question was selected', () => {
  const category = dataset.categories.find(category => category.topics.some(topic => topic.cards.some(card => card.kind === 'image')))!;
  const topic = category.topics.find(topic => topic.cards.some(card => card.kind === 'image'))!;
  const question = topic.cards.find(card => card.kind !== 'image')!;
  const brief: OpiHotspotBrief = { id: 'picture-issue', date: '2026-09-10', title: '图片话题', centers: [], topics: [{ topicId: topic.id, topicTitle: topic.name, cardIds: [question.id] }] };
  const paper = buildHotspotStudyPackage(brief, dataset);
  expect(paper.items).toHaveLength(1); expect(paper.items[0].card).toBe(question);
  const snapshot = captureStudyReview(paper.items, {}, {});
  expect(snapshot?.items[0].materials).toEqual(topic.cards.filter(card => card.kind === 'image'));
  expect(() => resolveHotspotTopics({ ...brief, topics: [{ ...brief.topics[0], cardIds: ['wrong-source-card'] }] }, dataset)).toThrow('不属于对应话题');
});
