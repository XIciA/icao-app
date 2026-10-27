import Storage from '@/platform/storage';
import { apiFetch } from '@/platform/api-client';
import { loadVocabulary } from '../catalog-loader';
import { currentVocabularyPolicy, liveVocabularyCacheKey } from '../live-catalog';
import { releaseFixture } from '../test-support/live-fixture';
let mockBase='https://cache-0.invalid',count=0;
jest.mock('expo-crypto',()=>({CryptoDigestAlgorithm:{SHA256:'sha256'},digestStringAsync:async(_type:string,text:string)=>jest.requireActual('node:crypto').createHash('sha256').update(text).digest('hex')}));
jest.mock('@/platform/api-client',()=>({getApiBaseUrl:()=>mockBase,apiFetch:jest.fn()}));
jest.mock('@/platform/storage',()=>({__esModule:true,default:{getItem:jest.fn(),setItem:jest.fn()}}));
const cached=releaseFixture(),updated=releaseFixture(5);
const flush=async()=>{for(let i=0;i<50;i++)await Promise.resolve();};
function deferred<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(done=>{resolve=done;});return {promise,resolve};}
const response=(data=cached)=>({ok:true,status:200,json:async()=>({data})}) as Response;
beforeEach(()=>{jest.clearAllMocks();mockBase=`https://cache-${++count}.invalid`;jest.mocked(Storage.getItem).mockResolvedValue(JSON.stringify(cached));jest.mocked(Storage.setItem).mockResolvedValue();});
it('shows cache before a stalled request, shares refresh, and accepts the new pair',async()=>{
  const gate=deferred<Response>(),refreshed=jest.fn();jest.mocked(apiFetch).mockReturnValue(gate.promise);
  expect(await loadVocabulary({preferCache:true,onRefresh:refreshed})).toMatchObject({source:'cache'});await loadVocabulary({preferCache:true});
  expect(apiFetch).toHaveBeenCalledTimes(1);expect(refreshed).not.toHaveBeenCalled();gate.resolve(response(updated));await flush();
  expect(refreshed).toHaveBeenCalledWith(expect.objectContaining({dataset:updated.dataset,source:'remote'}));expect(currentVocabularyPolicy()?.version).toBe(5);
  expect(Storage.setItem).toHaveBeenCalledWith(liveVocabularyCacheKey(mockBase),expect.any(String));
});
it('retains network-first semantics and rejects invalid cache on a different source',async()=>{
  jest.mocked(Storage.getItem).mockResolvedValue(null);const gate=deferred<Response>();jest.mocked(apiFetch).mockReturnValue(gate.promise);let settled=false;
  const first=loadVocabulary().then(value=>{settled=true;return value;});await flush();expect(settled).toBe(false);gate.resolve(response());expect((await first).source).toBe('remote');
  mockBase+='other';jest.mocked(Storage.getItem).mockResolvedValue('{broken');jest.mocked(apiFetch).mockRejectedValue(new Error('offline'));await expect(loadVocabulary()).rejects.toThrow('offline');
});
it.each(['checksum','version','policy'])('retains last valid content after invalid %s',async field=>{
  const invalid=releaseFixture(5);if(field==='checksum')invalid.checksum='a'.repeat(64);if(field==='version')invalid.version=3;if(field==='policy')invalid.policy.retiredIds.bad='missing';
  jest.mocked(apiFetch).mockResolvedValue(response(invalid));const refreshed=jest.fn();await loadVocabulary({preferCache:true,onRefresh:refreshed});await flush();
  expect(refreshed).toHaveBeenCalledWith(expect.objectContaining({source:'cache',warning:'vocabulary_remote_unavailable'}));expect(Storage.setItem).not.toHaveBeenCalled();expect(currentVocabularyPolicy()?.version).toBe(4);
});
it('rejects rollback and same-version rewriting without overwriting the valid snapshot',async()=>{
  jest.mocked(Storage.getItem).mockResolvedValue(JSON.stringify(updated));jest.mocked(apiFetch).mockResolvedValue(response(cached));expect((await loadVocabulary()).dataset.version).toBe(5);expect(Storage.setItem).not.toHaveBeenCalled();
});
it('rejects late results from another source and does not import any legacy-only cache',async()=>{
  const gate=deferred<Response>(),refreshed=jest.fn();jest.mocked(apiFetch).mockReturnValue(gate.promise);await loadVocabulary({preferCache:true,onRefresh:refreshed});mockBase+='other';gate.resolve(response(updated));await flush();expect(refreshed).not.toHaveBeenCalled();expect(Storage.setItem).not.toHaveBeenCalled();
  jest.mocked(Storage.getItem).mockImplementation(async key=>key==='icao.content.v1.vocabulary'?JSON.stringify(cached):null);jest.mocked(apiFetch).mockRejectedValue(new Error('offline'));await expect(loadVocabulary()).rejects.toThrow('offline');
});
it('keeps the prior catalog and policy together if saving the newer pair fails',async()=>{
  jest.mocked(Storage.setItem).mockRejectedValueOnce(new Error('disk full'));
  jest.mocked(apiFetch).mockResolvedValue(response(updated));
  const loaded=await loadVocabulary();
  expect(loaded).toMatchObject({source:'cache',warning:'vocabulary_remote_unavailable',dataset:{version:4}});
  expect(currentVocabularyPolicy()?.version).toBe(4);
  // A later successful retry is the first time either side of the pair upgrades.
  jest.mocked(Storage.setItem).mockResolvedValue();
  expect((await loadVocabulary()).dataset.version).toBe(5);expect(currentVocabularyPolicy()?.version).toBe(5);
});
