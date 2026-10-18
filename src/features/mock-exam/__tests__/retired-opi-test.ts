import data from '@/features/question-bank/data/question-bank.json';
import { questionBankRepository as nativeRepository } from '@/features/question-bank/data/repository.native';
import type { QuestionBankDataset } from '@/features/question-bank/types';
import { buildMockExamSession as nativeBuild } from '../build-session.native';

jest.mock('@/features/question-bank/data/repository.native', () => ({ questionBankRepository: { getDataset: jest.fn() } }));
const original = data.find(bank => bank.id === 'opi') as QuestionBankDataset;
const active = Array.from({length:5}, (_, i) => ({id:`active-${i}`,taskTitle:'Question',audioText:'Question?'}));
const retired = {id:'retired-history',taskTitle:'Old question',audioText:'Old?',retired:true};
const topic = {id:'kept-topic',name:'Topic',declaredCardCount:6,cards:[retired,...active]};
const source = {...original,categories:[{...original.categories[0],topics:[topic]}]};

it('excludes retired OPI questions from the shared native/formal-Web builder without deleting history',async ()=>{
 const build=nativeBuild,repository=nativeRepository;
 jest.mocked(repository.getDataset).mockResolvedValue(source);
 for(const seed of [1,4,19]){
  const session=await build({examType:'icao4-first',modules:['opi']},seed);
  expect(session.items.map(item=>item.card.id).sort()).toEqual(active.map(card=>card.id).sort());
 }
 expect(source.categories[0].topics[0].cards[0]).toBe(retired);
});
