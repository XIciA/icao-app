import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileRule, matchOccurrences, normalizeText } from './question-bank-vocabulary.mjs';
import { canonicalVocabularyJson, validateVocabularyLiveContent } from '../packages/contracts/src/vocabulary-live.ts';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const folder=resolve(root,'content/vocabulary/live'),out=resolve(root,'.generated/vocabulary-live');
const hash=value=>createHash('sha256').update(value).digest('hex');
const read=async path=>JSON.parse(await readFile(resolve(root,path),'utf8'));
const assert=(condition,message)=>{if(!condition)throw new Error(message)};

export async function buildLiveVocabulary(){
 const sourceBytes=await readFile(resolve(folder,'source.json')),source=JSON.parse(sourceBytes);
 assert(source.reviewChecksum===hash(await readFile(resolve(root,'content/vocabulary/reviewed-20261026/decisions.json'))),'vocabulary_review_changed');
 for(const name of ['editorial.tsv','meanings.tsv','decompositions.tsv'])assert(source.editorialChecksums?.[name]===hash(await readFile(resolve(folder,name))),`vocabulary_editorial_changed:${name}`);
 const registry=await read('content/question-banks/registry.json'),docs=[],files=[];
 const input=async path=>{const bytes=await readFile(resolve(root,path));files.push({path,checksum:hash(bytes)});return JSON.parse(bytes)};
 await input('content/question-banks/registry.json');
 for(const bankId of registry.bankIds){
  const base=`content/question-banks/banks/${bankId}`,bank=await input(`${base}/bank.json`);
  for(const categoryId of bank.categoryIds){
   const category=await input(`${base}/categories/${categoryId}.json`);
   for(const topicId of category.topicIds){
    const topic=await input(`${base}/topics/${topicId}.json`);
    for(const card of topic.cards){
     if(card.kind==='image')continue;
     const add=(field,text)=>{if(text?.trim())docs.push({bankId,cardId:card.id,field,text:normalizeText(text)})};
     add('audioText',card.audioText);if(bankId!=='listening')add('referenceText',card.referenceText);
     (card.choices??[]).forEach((text,index)=>add(`choices[${index}]`,text));
    }
   }
  }
 }
 const corpusChecksum=hash(JSON.stringify(files)),audit=[];
 const words=source.entries.map((entry,index)=>{
  const rule=compileRule(entry.frequencyRules),cards=new Set(),byBank={};let occurrences=0;
  const samples=[];
  for(const doc of docs){const match=matchOccurrences(doc.text,rule,true);if(!match.hits.length)continue;occurrences+=match.hits.length;cards.add(`${doc.bankId}:${doc.cardId}`);byBank[doc.bankId]=(byBank[doc.bankId]??0)+match.hits.length;if(samples.length<2)samples.push({...doc,match:match.hits[0]})}
  audit.push({id:entry.id,word:entry.word,occurrences,samples});
  return {id:entry.id,bookId:entry.bookId,level:entry.level,word:entry.word,meaning:entry.meaning,example:entry.example,exampleTranslation:entry.exampleTranslation,pronunciationText:entry.pronunciationText,...(entry.relatedExpressions?.length?{relatedExpressions:entry.relatedExpressions}:{}),
   frequency:{scope:'question-bank-english-content',occurrences,cardCount:cards.size,byBank,corpusVersion:registry.releaseVersion,corpusChecksum},source:{name:'用户人工复审与逐词编辑',rowIndex:index+1,sourceNo:entry.id}};
 });
 const dataset={schemaVersion:1,catalogId:'three-books-v3',version:source.version,source:{name:'2026-10-26用户人工复审词库',generatedAt:'2026-10-27T00:00:00.000Z',sourceRows:words.length,validRows:words.length,ignoredRows:0,invalidRows:0},books:source.books.map(book=>({...book,words:words.filter(word=>word.bookId===book.id)}))};
 const content={schemaVersion:1,catalogId:'vocabulary-live-v1',version:source.version,dataset,policy:{schemaVersion:1,version:source.version,retiredIds:source.retiredIds,retiredFavoriteKeys:source.retiredFavoriteKeys,testWords:Object.fromEntries(words.map(word=>[word.id,{word:word.word,meaning:word.meaning}]))}};
 validateVocabularyLiveContent(content);
 assert(hash(await readFile(resolve(folder,'source.json')))===hash(sourceBytes),'vocabulary_source_changed_during_build');
 return {content,report:{words:words.length,books:Object.fromEntries(dataset.books.map(book=>[book.id,book.words.length])),sourceChecksum:hash(sourceBytes),reviewChecksum:source.reviewChecksum,corpusChecksum,sourceFiles:files,entries:audit,retiredIds:Object.keys(content.policy.retiredIds).length}};
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const command=process.argv[2]??'check';assert(['build','check'].includes(command),'unknown_command');
 const {content,report}=await buildLiveVocabulary();const bytes=JSON.stringify(content,null,2)+'\n';
 if(command==='check')assert(await readFile(resolve(folder,'release.json'),'utf8')===bytes,'vocabulary_live_release_stale');
 else{await writeFile(resolve(folder,'release.tmp'),bytes);await rename(resolve(folder,'release.tmp'),resolve(folder,'release.json'))}
 await mkdir(out,{recursive:true});await writeFile(resolve(out,'build-report.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({command,words:report.words,books:report.books,retiredIds:report.retiredIds,checksum:hash(canonicalVocabularyJson(content))}));
}
