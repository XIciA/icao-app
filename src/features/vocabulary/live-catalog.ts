import { CryptoDigestAlgorithm, digestStringAsync } from 'expo-crypto';
import { canonicalVocabularyJson, validateVocabularyLiveContent, validateVocabularyPolicyTransition, vocabularyFavoriteKey, vocabularyTerms, type VocabularyLiveContent, type VocabularyLiveRelease } from '@icao/contracts/vocabulary-live';
import { migrateVocabularyDocument } from '@icao/contracts';
import { getApiBaseUrl } from '@/platform/api-client';
import Storage from '@/platform/storage';

export const liveVocabularyCacheKey=(base:string)=>`icao.content.v3.vocabulary.${encodeURIComponent(base)}.vocabulary-live-v1`;
type Installed={base:string;release:VocabularyLiveRelease;owners:Map<string,string>};
let installed:Installed|undefined;
const listeners=new Set<()=>void>();
const current=()=>installed?.base===(getApiBaseUrl()??'')?installed:undefined;
export const currentVocabularyPolicy=()=>current()?.release.policy;
export const currentVocabularyRelease=()=>current()?.release;
export const subscribeVocabularyCatalog=(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener);};};
export function currentVocabularyFavoriteOwner(text:string):string|null|undefined {
  const active=current();if(!active)return undefined;
  const key=vocabularyFavoriteKey(text),owner=active.owners.get(key);
  if(owner)return owner;
  if(Object.hasOwn(active.release.policy.retiredFavoriteKeys,key))return active.release.policy.retiredFavoriteKeys[key];
  return undefined;
}
export function migrateCurrentVocabulary<T extends Parameters<typeof migrateVocabularyDocument>[0]>(document:T):T {
  return migrateVocabularyDocument(document,currentVocabularyPolicy());
}
export async function validateLiveVocabularyRelease(value:unknown):Promise<VocabularyLiveRelease> {
  const content=validateVocabularyLiveContent(value);
  const checksum=(value as VocabularyLiveRelease).checksum;
  const payload:VocabularyLiveContent={schemaVersion:content.schemaVersion,catalogId:content.catalogId,version:content.version,dataset:content.dataset,policy:content.policy};
  if(typeof checksum!=='string'||!/^[a-f0-9]{64}$/.test(checksum)||await digestStringAsync(CryptoDigestAlgorithm.SHA256,canonicalVocabularyJson(payload))!==checksum)throw new Error('vocabulary_live_checksum_mismatch');
  return {...payload,checksum};
}
/** Installs the already verified pair atomically. It never writes a user's workspace. */
export function installVocabularyRelease(base:string,release:VocabularyLiveRelease) {
  if(base!==(getApiBaseUrl()??''))throw new Error('vocabulary_source_changed');
  const previous=current()?.release;
  if(previous){
    if(release.version<previous.version)throw new Error('vocabulary_version_regressed');
    if(release.version===previous.version){if(release.checksum!==previous.checksum)throw new Error('vocabulary_version_rewritten');return previous;}
    validateVocabularyPolicyTransition(previous,release);
  }
  const owners=new Map<string,string>();
  for(const word of release.dataset.books.flatMap(book=>book.words))for(const term of [word.word,...vocabularyTerms(word)])owners.set(vocabularyFavoriteKey(term),word.id);
  installed={base,release,owners};listeners.forEach(listener=>listener());return release;
}
const booting=new Map<string,Promise<VocabularyLiveRelease|undefined>>();
export async function readLiveVocabularyCache(base=getApiBaseUrl()??'') {
  const existing=current()?.release;if(existing)return existing;
  const pending=booting.get(base);if(pending)return pending;
  const request=(async()=>{
    const raw=await Storage.getItem(liveVocabularyCacheKey(base)).catch(()=>null);if(!raw)return undefined;
    try {const release=await validateLiveVocabularyRelease(JSON.parse(raw));return installVocabularyRelease(base,release);}catch{return undefined;}
  })().finally(()=>{if(booting.get(base)===request)booting.delete(base);});
  booting.set(base,request);return request;
}
