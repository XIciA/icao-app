import data from '../data/question-bank.json';
import publicData from '../data/question-bank-public.json';
import { naturalDatasetTitles, naturalTopicTitles } from '../lib/question-titles';
import type { QuestionBankDataset } from '../types';

it('renames listening and story questions without touching order, identity, audio or content', () => {
  for (const bank of data as QuestionBankDataset[]) {
    if (!['listening', 'storytelling'].includes(bank.id)) continue;
    const before = JSON.stringify(bank);
    const projected = naturalDatasetTitles(bank);
    bank.categories.forEach((category, c) => category.topics.forEach((topic, t) => {
      const changed = projected.categories[c].topics[t];
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
