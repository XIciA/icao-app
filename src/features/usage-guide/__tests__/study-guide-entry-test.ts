import { studyGuideEntry, STUDY_GUIDE_CARD } from '../study-guide-entry';
import { loadQuestionBank } from '@/features/question-bank/data/repository.native';
import type { QuestionBankDataset } from '@/features/question-bank/types';
jest.mock('@/features/question-bank/data/repository.native',()=>({loadQuestionBank:jest.fn()}));
it.each([false,true])('opens authoritative Sentence1 even with a catalog-only topic (%s)', async(catalogOnly)=>{
  const topic = {id:'first-topic',cards:catalogOnly ? [] : [{id:STUDY_GUIDE_CARD}],scopeCardIds:{all:[STUDY_GUIDE_CARD],selected:[],crash:[]}};
  jest.mocked(loadQuestionBank).mockResolvedValue({source:'embedded',dataset:{categories:[{id:'first-category',topics:[topic]}]} as unknown as QuestionBankDataset});
  expect(await studyGuideEntry()).toEqual({pathname:'/question-bank/[bankId]/study/[categoryId]/[topicId]',params:{bankId:'sentences900',categoryId:'first-category',topicId:'first-topic',cardId:STUDY_GUIDE_CARD,guide:'study'}});
  expect(loadQuestionBank).toHaveBeenCalledWith('sentences900');
});
it('reports unavailable content instead of inventing a session', async()=>{
  jest.mocked(loadQuestionBank).mockResolvedValue(undefined);
  await expect(studyGuideEntry()).rejects.toThrow('guide_entry_unavailable');
});
