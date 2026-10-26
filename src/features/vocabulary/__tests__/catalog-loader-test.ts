import Storage from '@/platform/storage';
import { apiFetch } from '@/platform/api-client';
import oldCatalog from '../../../../content/vocabulary/three-books/dataset.json';
import { loadVocabulary } from '../catalog-loader';
import { releaseFixture } from '../test-support/live-fixture';
let mockBase='https://loader-0.invalid';let count=0;
jest.mock('expo-crypto',()=>({CryptoDigestAlgorithm:{SHA256:'sha256'},digestStringAsync:async(_type:string,text:string)=>jest.requireActual('node:crypto').createHash('sha256').update(text).digest('hex')}));
jest.mock('@/platform/api-client',()=>({getApiBaseUrl:()=>mockBase,apiFetch:jest.fn()}));
jest.mock('@/platform/storage',()=>({__esModule:true,default:{getItem:jest.fn(),setItem:jest.fn()}}));
beforeEach(()=>{jest.clearAllMocks();mockBase=`https://loader-${++count}.invalid`;jest.mocked(Storage.getItem).mockResolvedValue(null);jest.mocked(Storage.setItem).mockResolvedValue();});
it('loads the verified live data and migration policy together and rejects an old response',async()=>{
  const release=releaseFixture();jest.mocked(apiFetch).mockResolvedValue({ok:true,status:200,json:async()=>({data:release})} as Response);
  const loaded=await loadVocabulary();expect(loaded.dataset.books.map(b=>b.id)).toEqual(['preview','icao4','icao5']);expect(loaded.release?.policy).toEqual(release.policy);
  expect(apiFetch).toHaveBeenCalledWith('/v1/vocabulary?catalog=vocabulary-live-v1',expect.anything());
  mockBase='https://old-response.invalid';jest.mocked(apiFetch).mockResolvedValue({ok:true,status:200,json:async()=>({data:{version:3,checksum:'a'.repeat(64),dataset:oldCatalog}})} as Response);
  await expect(loadVocabulary()).rejects.toThrow('invalid_live_vocabulary_version');
});
it('uses a complete verified cache offline without ever reading a legacy catalog as live',async()=>{
  const release=releaseFixture();jest.mocked(Storage.getItem).mockResolvedValue(JSON.stringify(release));jest.mocked(apiFetch).mockRejectedValue(new Error('offline'));
  expect(await loadVocabulary()).toMatchObject({dataset:release.dataset,source:'cache',warning:'vocabulary_remote_unavailable'});expect(Storage.setItem).not.toHaveBeenCalled();
});
