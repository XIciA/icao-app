import data from '../data/question-bank-public.json';
import { createCardDirectory, directoryHasCompleteBank } from '../data/card-directory';
import type { QuestionBankDataset } from '../types';
const banks = data as QuestionBankDataset[];
it('indexes every public identity even when member text is not embedded', () => {
  const index = createCardDirectory(banks);
  let total = 0, withoutBody = 0;
  for (const bank of banks) for (const category of bank.categories) for (const topic of category.topics) {
    for (const cardId of topic.scopeCardIds!.all) {
      total++;
      const ref = index.get({ bankId: bank.id, cardId });
      expect(ref).toMatchObject({ bankId: bank.id, categoryId: category.id, topicId: topic.id, cardId });
      expect(index.findLegacy(topic.id, cardId)).toEqual(ref);
      if (!ref?.card) withoutBody++;
    }
  }
  expect(index.size).toBe(total);
  expect(withoutBody).toBeGreaterThan(9000);
});
it('resolves moved topics by stable bank and card identity', () => {
  const bank = banks[0], category = bank.categories[0], topic = category.topics[0], cardId = topic.scopeCardIds!.all[0];
  const moved = { ...bank, categories: [{ ...category, id: 'new-category', topics: [{ ...topic, id: 'new-topic' }] }] };
  expect(createCardDirectory([moved]).get({ bankId: bank.id, cardId })).toMatchObject({ categoryId: 'new-category', topicId: 'new-topic' });
});
it('rejects duplicate identities instead of choosing an arbitrary question', () => {
  expect(() => createCardDirectory([banks[0], banks[0]])).toThrow('duplicate_question_identity');
});
it('does not treat a partial directory as proof of deletion', () => {
  const bank = banks[0];
  const partial = { ...bank, categories: [{ ...bank.categories[0], topics: [{ ...bank.categories[0].topics[0], scopeCardIds: undefined, cards: [] }] }] };
  expect(directoryHasCompleteBank(partial)).toBe(false);
});
