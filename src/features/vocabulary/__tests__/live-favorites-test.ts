import { installVocabularyRelease, migrateCurrentVocabulary } from '../live-catalog';
import { favoriteKeyForWord } from '../favorites';
import { releaseFixture } from '../test-support/live-fixture';
import { vocabularyFavoriteKey } from '@icao/contracts/vocabulary-live';
import { setWordFavorite, resetVocabularyMutationQueueForTests } from '../progress-store.native';
import { readVocabularyState,writeVocabularyState } from '../persistence';
let mockBase='https://favorites-0.invalid';
jest.mock('@/platform/api-client',()=>({getApiBaseUrl:()=>mockBase}));
jest.mock('@/features/sync/learning-sync.native',()=>({captureLearningWriteContext:()=>({}),assertLearningWriteContext:()=>{},mutateVocabularyInCurrentWorkspace:async(_owner:unknown,action:()=>Promise<unknown>)=>action()}));
jest.mock('../persistence',()=>({createEmptyVocabularyState:()=>({schemaVersion:1,words:{},updatedAt:'2026-10-27T00:00:00.000Z'}),readVocabularyState:jest.fn(),writeVocabularyState:jest.fn(),subscribeVocabularyState:()=>()=>{}}));
it('shares stable ID favorites with lookup synonyms and never resets learned status',async()=>{
  resetVocabularyMutationQueueForTests();const release=releaseFixture(),word=release.dataset.books[0]!.words[0]!;
  installVocabularyRelease(mockBase,release);
  expect(favoriteKeyForWord(word.word)).toBe(word.id);
  const state={schemaVersion:1 as const,updatedAt:'2026-10-27T00:00:00.000Z',words:{[word.id]:{status:'known' as const,favorite:false,updatedAt:'2026-10-27T00:00:00.000Z'}}};
  jest.mocked(readVocabularyState).mockResolvedValue(state);jest.mocked(writeVocabularyState).mockImplementation(async state=>state);
  expect((await setWordFavorite({word:word.word},true)).words[word.id]).toMatchObject({status:'known',favorite:true});
});
it('deletes retired favorites and allows a new stable ID with the same spelling without reviving the old fact',()=>{
  mockBase='https://favorites-readd.invalid';const release=releaseFixture(),word=release.dataset.books[0]!.words[0]!;
  release.policy.retiredFavoriteKeys[vocabularyFavoriteKey(word.word)]=null;release.policy.retiredIds.old=null;
  installVocabularyRelease(mockBase,release);expect(favoriteKeyForWord(word.word)).toBe(word.id);
  const progress={status:'known' as const,favorite:true,updatedAt:'2026-10-27T00:00:00.000Z'};
  const result=migrateCurrentVocabulary({words:{old:progress,[vocabularyFavoriteKey(word.word)]:progress},updatedAt:progress.updatedAt});
  expect(result.words).toEqual({});
});
