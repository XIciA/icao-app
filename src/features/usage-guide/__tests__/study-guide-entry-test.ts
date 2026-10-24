import { studyGuideEntry } from '../study-guide-entry';
import { loadQuestionBank } from '@/features/question-bank/data/repository.native';
import type { QuestionBankDataset } from '@/features/question-bank/types';
jest.mock('@/features/question-bank/data/repository.native',()=>({loadQuestionBank:jest.fn()}));
it('opens the first available real LT question and never invents sample identifiers', async()=>{
  jest.mocked(loadQuestionBank).mockResolvedValue({source:'embedded',dataset:{categories:[{id:'first-category',topics:[{id:'first-topic',cards:[{id:'retired',retired:true},{id:'real-first'}]}]}]} as QuestionBankDataset});
  expect(await studyGuideEntry()).toEqual({pathname:'/question-bank/[bankId]/study/[categoryId]/[topicId]',params:{bankId:'radiotelephony',categoryId:'first-category',topicId:'first-topic',cardId:'real-first'}});
  expect(loadQuestionBank).toHaveBeenCalledWith('radiotelephony');
});
it('reports unavailable content instead of opening an empty or fabricated session', async()=>{
  jest.mocked(loadQuestionBank).mockResolvedValue(undefined);
  await expect(studyGuideEntry()).rejects.toThrow('guide_entry_unavailable');
});
