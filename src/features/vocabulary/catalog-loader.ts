import { validateVocabularyCatalog } from '@icao/contracts';
import Storage from '@/platform/storage';
import type { ApiSuccessEnvelope, VocabularyDataset } from '@icao/contracts';
import type { VocabularyLiveRelease } from '@icao/contracts/vocabulary-live';
import { apiFetch, getApiBaseUrl } from '@/platform/api-client';
import { currentVocabularyRelease, installVocabularyRelease, liveVocabularyCacheKey, readLiveVocabularyCache, validateLiveVocabularyRelease } from './live-catalog';

export type VocabularyLoadResult={dataset:VocabularyDataset;release?:VocabularyLiveRelease;source:'remote'|'cache';warning?:'vocabulary_remote_unavailable'};
export type VocabularyLoadOptions={preferCache?:boolean;onRefresh?:(result:VocabularyLoadResult)=>void};
export const validateVocabularyDataset=validateVocabularyCatalog;
const result=(release:VocabularyLiveRelease,source:'remote'|'cache',warning?:'vocabulary_remote_unavailable'):VocabularyLoadResult=>({dataset:release.dataset,release,source,...(warning?{warning}:{})});
const pending=new Map<string,Promise<VocabularyLoadResult>>();
function refreshVocabulary(base:string,cached?:VocabularyLiveRelease):Promise<VocabularyLoadResult>{
  const existing=pending.get(base);if(existing)return existing;
  const assertSource=()=>{if((getApiBaseUrl()??'')!==base)throw new Error('vocabulary_source_changed');};
  const request=(async()=>{
    try{
      assertSource();if(!base)throw new Error('vocabulary_api_unavailable');
      const response=await apiFetch('/v1/vocabulary?catalog=vocabulary-live-v1',{headers:cached?{'if-none-match':`"${cached.checksum}"`}:undefined});
      assertSource();
      if(response.status===304&&cached)return result(cached,'cache');
      if(!response.ok)throw new Error(`vocabulary_http_${response.status}`);
      const body=await response.json() as ApiSuccessEnvelope<VocabularyLiveRelease>;
      const release=await validateLiveVocabularyRelease(body.data);assertSource();
      // Data and cumulative migration rules are one validated, monotonic snapshot.
      installVocabularyRelease(base,release);
      await Storage.setItem(liveVocabularyCacheKey(base),JSON.stringify(release)).catch(()=>undefined);
      assertSource();return result(release,'remote');
    }catch(error){
      assertSource();const fallback=currentVocabularyRelease()??cached;
      if(fallback)return result(fallback,'cache','vocabulary_remote_unavailable');throw error;
    }
  })().finally(()=>{if(pending.get(base)===request)pending.delete(base);});pending.set(base,request);return request;
}
/** Default network-first; screens explicitly choose cached content and apply refresh only at safe boundaries. */
export async function loadVocabulary(options:VocabularyLoadOptions={}):Promise<VocabularyLoadResult>{
  const base=getApiBaseUrl()??'',cached=await readLiveVocabularyCache(base);
  if((getApiBaseUrl()??'')!==base)throw new Error('vocabulary_source_changed');
  const refresh=refreshVocabulary(base,cached);
  if(options.preferCache&&cached){void refresh.then(value=>options.onRefresh?.(value)).catch(()=>undefined);return result(cached,'cache');}
  return refresh;
}
