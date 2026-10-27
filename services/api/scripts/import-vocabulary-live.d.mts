import type { VocabularyLiveContent } from '@icao/contracts/vocabulary-live';
import type { Sql, TransactionSql } from 'postgres';
export type VocabularyImportSummary = {version:number;checksum:string;words:number;books:Record<string,number>;retiredIds:number;audioPaths:number};
export type VocabularyImportCandidate = {content:VocabularyLiveContent;checksum:string;audioPaths:string[];summary:VocabularyImportSummary};
export type VocabularyImportPlan = VocabularyImportSummary & {baseVersion:number|null;alreadyPublished:boolean;missingAudio:string[];published?:boolean};
export function readVocabularyImport(path:string):VocabularyImportCandidate;
export function vocabularyImportPlan(tx:Sql|TransactionSql,candidate:VocabularyImportCandidate):Promise<VocabularyImportPlan>;
export function importVocabulary(mode:'validate',path:string,environment?:NodeJS.ProcessEnv):Promise<VocabularyImportSummary>;
export function importVocabulary(mode:'plan'|'publish',path:string,environment?:NodeJS.ProcessEnv):Promise<VocabularyImportPlan>;
