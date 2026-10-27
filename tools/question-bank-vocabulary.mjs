import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const directory = resolve(root, 'content/vocabulary/question-bank-core');
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const assert = (ok, message) => { if (!ok) throw new Error(message); };
const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function normalizeText(text) {
  return text.normalize('NFKC').replace(/[’‘]/g, "'").replace(/[–—]/g, '-').replace(/\\n/g, '\n').replace(/\s+/g, ' ').trim();
}

export function compileRule(rule) {
  assert(rule.forms?.length && rule.forms.every(f => typeof f === 'string' && f.trim()), 'frequency_forms_missing');
  const forms = [...new Set(rule.forms.map(f => rule.caseSensitive ? normalizeText(f) : normalizeText(f).toLowerCase()))].sort((a,b) => b.length-a.length || a.localeCompare(b));
  // A hyphenated prefix is part of a word: e.g. non-precision is not precision.
  const pattern = new RegExp(`(?<![A-Za-z0-9-])(?:${forms.map(f => escape(f).replace(/ /g, '[ -]+')).join('|')})(?![A-Za-z0-9-])`, rule.caseSensitive ? 'g' : 'gi');
  const expressions = Object.fromEntries(['includeContext','excludeContext','excludeBefore','excludeAfter'].map(k => [k,(rule[k]??[]).map(p => new RegExp(p,'i'))]));
  return { pattern, expressions };
}

export function matchOccurrences(text, compiled, alreadyNormalized = false) {
  const clean = alreadyNormalized ? text : normalizeText(text), hits = [], excluded = [];
  compiled.pattern.lastIndex=0;
  for (const match of clean.matchAll(compiled.pattern)) {
    const start=match.index, end=start+match[0].length;
    // Keep semantic guards local to this occurrence, not an unrelated part of a story.
    let before=clean.slice(Math.max(0,start-65),start), after=clean.slice(end,end+65);
    const boundaries=[...before.matchAll(/[.!?;](?=\s|$)/g)];
    if(boundaries.length)before=before.slice(boundaries.at(-1).index+1);
    const boundary=after.search(/[.!?;](?=\s|$)/);
    if(boundary>=0)after=after.slice(0,boundary+1);
    const context=before+match[0]+after;
    const r=compiled.expressions;
    const reason=r.includeContext.length&&!r.includeContext.some(p=>p.test(context))?'outside_selected_sense'
      :r.excludeBefore.some(p=>p.test(before))?'excluded_left_context'
      :r.excludeAfter.some(p=>p.test(after))?'excluded_right_context'
      :r.excludeContext.some(p=>p.test(context))?'excluded_context':undefined;
    const hit={start,end,form:match[0],context};
    if(reason)excluded.push({...hit,reason});else hits.push(hit);
  }
  return {hits,excluded};
}

export async function build() {
  const sourceBytes=await readFile(resolve(directory,'source.json'));
  const source=JSON.parse(sourceBytes);
  assert(source.entries.length===409,'core_entry_count');
  const ids=new Set(), words=new Set();
  for(const e of source.entries){
    assert(!ids.has(e.id)&&!words.has(e.word.toLowerCase()),`duplicate_core:${e.word}`);ids.add(e.id);words.add(e.word.toLowerCase());
    for(const f of ['word','meaning','example','exampleTranslation','pronunciationText'])assert(e[f]?.trim(),`core_missing_${f}:${e.id}`);
    assert(/[\u4e00-\u9fff]/u.test(e.exampleTranslation),`core_translation_missing:${e.id}`);
  }
  const sourceFiles=[];
  async function json(path){const b=await readFile(path);sourceFiles.push({path:relative(root,path),checksum:digest(b)});return JSON.parse(b);}
  const base=resolve(root,'content/question-banks'), registry=await json(resolve(base,'registry.json'));
  const cards=[];let images=0;
  for(const bankId of registry.bankIds){
    const b=resolve(base,'banks',bankId),bank=await json(resolve(b,'bank.json'));const seen=new Set();let count=0;
    for(const cid of bank.categoryIds){
      const category=await json(resolve(b,'categories',`${cid}.json`));
      for(const tid of category.topicIds){
        const topic=await json(resolve(b,'topics',`${tid}.json`));assert(topic.cards.length===topic.declaredCardCount,`topic_count:${tid}`);
        for(const c of topic.cards){
          assert(!seen.has(c.id),`duplicate_card:${bankId}:${c.id}`);seen.add(c.id);count++;
          if(c.kind==='image'){images++;continue;}
          assert(c.audioText?.trim(),`missing_audioText:${c.id}`);
          cards.push({bankId,cardId:c.id,text:c.audioText});
        }
      }
    }
    assert(count===bank.declaredCardCount,`bank_count:${bankId}`);
  }
  const corpusChecksum=digest(JSON.stringify(sourceFiles));
  const evidence=[],exclusions=[],output=[];
  for(const e of source.entries){
    const rule=compileRule(e.frequencyRules);let occurrences=0;const matchedCards=new Set(),byBank={};
    for(const c of cards){
      const {hits,excluded}=matchOccurrences(c.text,rule);
      if(hits.length){occurrences+=hits.length;matchedCards.add(`${c.bankId}:${c.cardId}`);byBank[c.bankId]=(byBank[c.bankId]??0)+hits.length;}
      for(const h of hits)evidence.push({wordId:e.id,word:e.word,bankId:c.bankId,cardId:c.cardId,field:'audioText',...h});
      for(const h of excluded)exclusions.push({wordId:e.id,word:e.word,bankId:c.bankId,cardId:c.cardId,...h});
    }
    // A zero must stay zero, never be represented as a positive frequency badge.
    output.push({id:e.id,bookId:source.id,level:2,word:e.word,meaning:e.meaning,example:e.example,exampleTranslation:e.exampleTranslation,pronunciationText:e.pronunciationText,
      frequency:{scope:'question-bank-audio-text',occurrences,cardCount:matchedCards.size,byBank,corpusVersion:registry.releaseVersion,corpusChecksum},
      source:{name:'全题库核心词逐条审核',rowIndex:output.length+1,sourceNo:e.reviewId}});
  }
  output.sort((a,b)=>b.frequency.occurrences-a.frequency.occurrences||a.id.localeCompare(b.id));
  const book={id:source.id,level:2,name:source.name,description:source.description,assessmentEligible:false,words:output};
  return {book,report:{schemaVersion:1,sourceChecksum:digest(sourceBytes),corpusVersion:registry.releaseVersion,corpusChecksum,sourceFiles,textCards:cards.length,imageCards:images,entries:output.length,zeroMatches:output.filter(w=>!w.frequency.occurrences).map(w=>w.word),evidence,exclusions}};
}

async function main(){
  const command=process.argv[2]??'check';assert(['build','check'].includes(command),'unknown_command');
  const {book,report}=await build();
  const bytes=JSON.stringify(book,null,2)+'\n';const target=resolve(directory,'book.json');
  if(command==='build'){
    await writeFile(target,bytes);
    const out=resolve(root,'.generated/vocabulary-core');await mkdir(out,{recursive:true});
    await writeFile(resolve(out,'frequency-audit.json'),JSON.stringify(report,null,2)+'\n');
  }else assert(await readFile(target,'utf8')===bytes,'question_bank_vocabulary_stale_run_build');
  console.log(JSON.stringify({command,entries:book.words.length,corpusVersion:report.corpusVersion,textCards:report.textCards,occurrences:report.evidence.length,excluded:report.exclusions.length,zeroMatches:report.zeroMatches}));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
