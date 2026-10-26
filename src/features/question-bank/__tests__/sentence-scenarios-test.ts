import data from '../data/question-bank.json';
import { scopeDataset } from '../lib/study-scope';
import { SENTENCE_SCENARIOS, sentenceScenario, sentenceScenarioCount, sentenceScenarioPackage } from '../lib/sentence-scenarios';
import type { QuestionBankDataset } from '../types';
const original = (data as QuestionBankDataset[]).find(bank => bank.id === 'sentences900')!;
it.each([['icao4-first',721],['icao5-first',900]] as const)('preserves %s scope and every original identity and recording', (goal, count) => {
 const bank=scopeDataset(original,'all',goal);
 const packages=SENTENCE_SCENARIOS.map(scene=>sentenceScenarioPackage(bank,scene.id));
 const items=packages.flatMap(pack=>pack.items);
 expect(items).toHaveLength(count); expect(new Set(items.map(item=>item.card.id)).size).toBe(count);
 expect(SENTENCE_SCENARIOS.reduce((sum,scene)=>sum+sentenceScenarioCount(bank,scene.id),0)).toBe(count);
 for(const item of items){
  const category=bank.categories.find(category=>category.id===item.category.id)!;
  const topic=category.topics.find(topic=>topic.id===item.topic.id)!;
  expect(topic.cards.find(card=>card.id===item.card.id)).toBe(item.card);
 }
});
it('maps chapter boundaries and rejects unrelated IDs',()=>{
 expect(sentenceScenario('sentence900-main-85')?.id).toBe('basic');
 expect(sentenceScenario('sentence900-main-86')?.id).toBe('aerodrome');
 expect(sentenceScenario('sentence900-main-900')?.id).toBe('other');
 expect(sentenceScenario('sentence900-main-901')).toBeUndefined();
});
