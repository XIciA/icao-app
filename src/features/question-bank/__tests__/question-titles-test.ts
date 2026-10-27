import data from '../data/question-bank.json';
import publicData from '../data/question-bank-public.json';
import { naturalDatasetTitles, naturalTopicTitles } from '../lib/question-titles';
import type { QuestionBankDataset } from '../types';

it('renames listening and story questions without touching order, identity, audio or content', () => {
  for (const bank of data as QuestionBankDataset[]) {
    if (!['listening', 'storytelling'].includes(bank.id)) continue;
    const before = JSON.stringify(bank);
    const projected = naturalDatasetTitles(bank);
    bank.categories.forEach(category => category.topics.forEach(topic => {
      const changed = projected.categories.find(item => item.id === category.id)!.topics.find(item => item.id === topic.id)!;
      expect(changed.cards.map(card => card.id)).toEqual(topic.cards.map(card => card.id));
      topic.cards.forEach((card, i) => {
        expect(changed.cards[i]).toEqual({ ...card, taskTitle: changed.cards[i].taskTitle });
        if (!card.retired) expect(changed.cards[i].taskTitle).toMatch(new RegExp(`-${i + 1}$`));
      });
    }));
    expect(JSON.stringify(bank)).toBe(before);
  }
});
it('uses the complete directory for public/filtered content instead of renumbering its subset', () => {
  for (const bank of publicData as QuestionBankDataset[]) {
    if (!['listening', 'storytelling'].includes(bank.id)) continue;
    for (const category of bank.categories) for (const topic of category.topics) {
      const result=naturalTopicTitles(bank.id,topic);
      result.cards.forEach(card=>expect(card.taskTitle).toMatch(new RegExp(`-${topic.scopeCardIds!.all.indexOf(card.id)+1}$`)));
    }
  }
});
it('labels the radiotelephony scoring group 专项训练 without changing content, identity or airline names', () => {
  const bank = (data as QuestionBankDataset[]).find(item => item.id === 'radiotelephony')!;
  const before = JSON.stringify(bank);
  const projected = naturalDatasetTitles(bank);
  expect(projected.categories.find(item => item.id === 'atc-scoring-points')?.name).toBe('专项训练');
  bank.categories.forEach(category => {
    const next = projected.categories.find(item => item.id === category.id)!;
    expect(next).toEqual({ ...category, name: category.id === 'atc-scoring-points' ? '专项训练' : category.name });
  });
  expect(JSON.stringify(bank)).toBe(before);
});

it('restores Sentence plus the original number across cards and metadata without changing identity or content', () => {
  for (const source of [data, publicData]) {
    const bank = (source as QuestionBankDataset[]).find(item => item.id === 'sentences900')!;
    const original = JSON.stringify(bank);
    const projected = naturalDatasetTitles(bank);
    bank.categories.forEach((category, c) => category.topics.forEach((topic, t) => {
      const next = projected.categories[c].topics[t];
      next.cards.forEach((card, index) => {
        expect(card).toEqual({ ...topic.cards[index], taskTitle: `Sentence${Number(card.id.split('-').at(-1))}` });
      });
      next.radioEntries?.forEach((entry, index) => {
        expect(entry).toEqual({ ...topic.radioEntries![index], title: `Sentence${Number(entry.id.split('-').at(-1))}` });
      });
    }));
    expect(JSON.stringify(bank)).toBe(original);
  }
});
