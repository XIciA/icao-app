import { useEffect, useRef, useState } from 'react';
import type { VocabularyBookId } from '@icao/contracts';
import type { VocabularyLevelChange, VocabularyLevelPlan, VocabularyLevelPublication } from '@icao/contracts/vocabulary-admin';
import type { VocabularyLiveRelease } from '@icao/contracts/vocabulary-live';
import { opsApi } from './api';

const names:Record<string,string>={preview:'ICAO 考前预习',icao4:'ICAO 4 必会',icao5:'ICAO 5 冲刺'};
const message=(error:unknown)=>error instanceof Error?error.message:'操作未完成';
const errors:Record<string,string>={vocabulary_version_changed_reload:'词库已更新。草稿已保留，请核对最新词库后继续。',vocabulary_preview_changed:'预览已变化，请重新检查。',vocabulary_audio_incomplete:'词库录音尚未完整，暂时不能发布。',vocabulary_no_level_changes:'没有实际等级变化。',invalid_vocabulary_book:'每个分类需至少保留一个单词。',vocabulary_batch_id_reused:'批次内容与已提交记录不一致，请核对最新词库。'};
type Draft={schemaVersion:1;baseVersion:number;changes:VocabularyLevelChange[];note:string;batchId:string;undo:VocabularyLevelChange[][];submission?:{checksum:string}};
const newDraft=(version:number):Draft=>({schemaVersion:1,baseVersion:version,changes:[],note:'',batchId:crypto.randomUUID(),undo:[]});
function restore(key:string):Draft|undefined {
  try{
    const value=JSON.parse(localStorage.getItem(key)??'null') as Draft|null;
    if(!value||value.schemaVersion!==1||!Number.isSafeInteger(value.baseVersion)||value.baseVersion<1||!Array.isArray(value.changes)||value.changes.length>5000||!Array.isArray(value.undo)||typeof value.note!=='string'||typeof value.batchId!=='string')return;
    if(!value.changes.every(change=>change&&typeof change.id==='string'&&typeof change.word==='string'&&Object.hasOwn(names,change.from)&&Object.hasOwn(names,change.to)))return;
    return {...value,undo:[]};
  }catch{return;}
}
export function VocabularyLevelsPage({actorId,onDirtyChange,onPublished}:{actorId:string;onDirtyChange:(value:boolean)=>void;onPublished:()=>void}) {
  const key=`icao.ops.vocabulary-levels.v1.${actorId}`;
  const [draft,setDraft]=useState<Draft|undefined>(()=>restore(key));
  const [release,setRelease]=useState<VocabularyLiveRelease>();
  const [book,setBook]=useState<VocabularyBookId>('icao4');
  const [query,setQuery]=useState(''),[sort,setSort]=useState('frequency');
  const [selected,setSelected]=useState<Set<string>>(new Set());
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const [storageError,setStorageError]=useState(false),[plan,setPlan]=useState<VocabularyLevelPlan>();
  const [review,setReview]=useState(false),[details,setDetails]=useState<string>();
  const busyRef=useRef(false);
  const draftRef=useRef(draft);draftRef.current=draft;
  const dirty=Boolean(draft?.changes.length||draft?.submission);
  useEffect(()=>{onDirtyChange(dirty);},[dirty,onDirtyChange]);
  useEffect(()=>{
    try{if(draft?.changes.length||draft?.submission)localStorage.setItem(key,JSON.stringify(draft));else localStorage.removeItem(key);setStorageError(false);}catch{setStorageError(true);}
  },[draft,key]);
  useEffect(()=>{void load();},[]);
  async function load(){if(busyRef.current)return;busyRef.current=true;setBusy(true);setError('');try{const next=await opsApi<VocabularyLiveRelease>('/v1/admin/vocabulary');setRelease(next);setDraft(current=>current??newDraft(next.version));setSelected(new Set());}catch(e){setError(message(e));}finally{busyRef.current=false;setBusy(false);}}
  const originals=release?.dataset.books.flatMap(value=>value.words)??[];
  const byId=new Map(originals.map(word=>[word.id,word]));
  const changes=new Map(draft?.changes.map(change=>[change.id,change]));
  const effective=originals.map(word=>({...word,bookId:changes.get(word.id)?.to??word.bookId}));
  const visible=effective.filter(word=>word.bookId===book&&`${word.word} ${word.meaning}`.toLowerCase().includes(query.toLowerCase())).sort((a,b)=>{
    if(sort.startsWith('frequency')){const left=a.frequency?.occurrences??-1,right=b.frequency?.occurrences??-1;if(left!==right)return left<0?1:right<0?-1:sort==='frequency'?right-left:left-right;}
    const order=a.word.localeCompare(b.word,'en',{sensitivity:'base'})||a.id.localeCompare(b.id);return sort==='alphabetical-desc'?-order:order;
  });
  const stale=Boolean(release&&draft&&release.version!==draft.baseVersion);
  const conflicts=stale?(draft?.changes??[]).filter(change=>{const current=byId.get(change.id);return !current||current.bookId!==change.from&&current.bookId!==change.to;}):[];
  const locked=busy||Boolean(draft?.submission);
  function change(next:Draft){setDraft({...next,batchId:crypto.randomUUID(),submission:undefined});setPlan(undefined);setError('');}
  function move(target:VocabularyBookId){if(!draft||locked||stale)return;const next=new Map(changes);for(const id of selected){const original=byId.get(id);if(!original)continue;if(original.bookId===target)next.delete(id);else next.set(id,{id,word:original.word,from:original.bookId,to:target});}change({...draft,changes:[...next.values()],undo:[...draft.undo.slice(-19),draft.changes]});setSelected(new Set());setNotice('已加入草稿，尚未发布。');}
  function undo(){if(!draft||locked||!draft.undo.length)return;change({...draft,changes:draft.undo.at(-1)!,undo:draft.undo.slice(0,-1)});setSelected(new Set());}
  function rebase(){if(!draft||!release||conflicts.length||locked)return;change({...draft,baseVersion:release.version,changes:draft.changes.filter(item=>byId.get(item.id)?.bookId!==item.to).map(item=>({...item,word:byId.get(item.id)!.word,from:byId.get(item.id)!.bookId})),undo:[]});setNotice('已核对最新词库，请重新预览。');}
  function resolveConflict(id:string,keepDraft:boolean){if(!draft)return;const current=byId.get(id);change({...draft,changes:draft.changes.flatMap(item=>item.id!==id?[item]:keepDraft&&current?[{...item,from:current.bookId,word:current.word}]:[]),undo:[]});}
  async function preview(){if(!draft||stale||busyRef.current)return;busyRef.current=true;setBusy(true);setError('');setPlan(undefined);try{setPlan(await opsApi('/v1/admin/vocabulary/levels/preview',{method:'POST',body:JSON.stringify({baseVersion:draft.baseVersion,moves:draft.changes.map(({id,to})=>({id,bookId:to}))})}));}catch(e){const code=message(e);setError(code);if(code==='vocabulary_version_changed_reload'){const current=await opsApi<VocabularyLiveRelease>('/v1/admin/vocabulary').catch(()=>undefined);if(current)setRelease(current);}}finally{busyRef.current=false;setBusy(false);}}
  async function publish(){const current=draftRef.current;if(!current||busyRef.current||(!current.submission&&!plan))return;busyRef.current=true;setBusy(true);setError('');const submission=current.submission??{checksum:plan!.checksum};const pending={...current,submission};
    // Persist the exact retry payload before sending. Never silently reuse its batch ID for edited content.
    try{localStorage.setItem(key,JSON.stringify(pending));}catch{setStorageError(true);}
    setDraft(pending);
    try{const result=await opsApi<VocabularyLevelPublication>('/v1/admin/vocabulary/levels/publish',{method:'POST',body:JSON.stringify({baseVersion:pending.baseVersion,moves:pending.changes.map(({id,to})=>({id,bookId:to})),note:pending.note,batchId:pending.batchId,checksum:submission.checksum})});setRelease(result.release);setDraft(newDraft(result.release.version));setPlan(undefined);setReview(false);setSelected(new Set());setNotice(`已提交发布版本 ${result.publishedVersion}。App 下次刷新词库时生效。`);onPublished();}
    catch(e){const code=message(e);setError(code);if(['vocabulary_version_changed_reload','vocabulary_preview_changed','vocabulary_audio_incomplete','vocabulary_batch_id_reused','invalid_vocabulary_admin_request'].includes(code)){setDraft(value=>value?{...value,submission:undefined}:value);setPlan(undefined);if(code==='vocabulary_version_changed_reload'){const next=await opsApi<VocabularyLiveRelease>('/v1/admin/vocabulary').catch(()=>undefined);if(next)setRelease(next);}}}
    finally{busyRef.current=false;setBusy(false);}
  }
  const detail=byId.get(details??'');
  return <div className="vocab-levels">
    {error&&<p className="notice error" role="alert">{errors[error]??(error.startsWith('invalid_vocabulary_book:')?'每个分类需至少保留一个单词，请调整草稿后重试。':error)}</p>}{notice&&<p className="notice success" role="status">{notice}</p>}
    {!release?<p className="muted">{busy?'正在读取词库…':'词库暂时不可用。'} <button disabled={busy} onClick={()=>void load()}>重新读取词库</button></p>:<>
      <p className="muted">线上版本 {release.version} · {originals.length} 词。分类数量按草稿预览，提交后正式生效。</p>
      <nav className="ops-tabs" aria-label="批量调整词书">{release.dataset.books.map(value=><button disabled={busy} key={value.id} className={book===value.id?'active':''} onClick={()=>{setBook(value.id);setSelected(new Set());}}>{value.name} · {effective.filter(word=>word.bookId===value.id).length}</button>)}</nav>
      <div className="vocab-toolbar"><input aria-label="搜索批量词条" placeholder="搜索英文或中文" value={query} onChange={event=>{setQuery(event.target.value);setSelected(new Set());}}/><select aria-label="批量词条排序" value={sort} onChange={event=>setSort(event.target.value)}><option value="frequency">频率：高 → 低</option><option value="frequency-asc">频率：低 → 高</option><option value="alphabetical">字母：A–Z</option><option value="alphabetical-desc">字母：Z–A</option></select><button disabled={busy} onClick={()=>void load()}>核对最新词库</button></div>
      {stale&&<div className="notice"><p>线上版本已变化，草稿仍保留。请处理分类冲突，再合入最新词库。</p>{conflicts.map(item=><div className="vocab-conflict" key={item.id}><span>{item.word}：原 {names[item.from]} → 草稿 {names[item.to]}；线上 {byId.has(item.id)?names[byId.get(item.id)!.bookId]:'已删除'}</span><button disabled={locked} onClick={()=>resolveConflict(item.id,false)}>采用线上</button>{byId.has(item.id)&&<button disabled={locked} onClick={()=>resolveConflict(item.id,true)}>保留草稿目标</button>}</div>)}<button disabled={locked||Boolean(conflicts.length)} onClick={rebase}>合入最新词库并保留调整</button></div>}
      <div className="vocab-bulk-actions"><label><input type="checkbox" aria-label="全选当前筛选结果" disabled={locked||stale||!visible.length} checked={Boolean(visible.length)&&visible.every(word=>selected.has(word.id))} onChange={event=>setSelected(event.target.checked?new Set(visible.map(word=>word.id)):new Set())}/>全选当前筛选结果（{visible.length} 个）</label><span>已选 {selected.size} 个</span>{release.dataset.books.filter(value=>value.id!==book).map(value=><button key={value.id} disabled={locked||stale||!selected.size} onClick={()=>move(value.id)}>移入{value.name}</button>)}<button disabled={!selected.size||busy} onClick={()=>setSelected(new Set())}>清空选择</button></div>
      <div className="vocab-bulk-list">{visible.map(word=><div className="result-card" key={word.id}><input type="checkbox" aria-label={`选择 ${word.word}`} disabled={locked||stale} checked={selected.has(word.id)} onChange={event=>setSelected(current=>{const next=new Set(current);if(event.target.checked)next.add(word.id);else next.delete(word.id);return next;})}/><button className="vocab-word-detail" onClick={()=>setDetails(details===word.id?undefined:word.id)}><strong>{word.word}</strong><small>{word.meaning}</small>{changes.has(word.id)&&<small>待提交 · 从{names[changes.get(word.id)!.from]}移入</small>}</button><span className="pill">{word.frequency?.occurrences??0} 次</span></div>)}{!visible.length&&<p className="muted">没有符合条件的词条。</p>}</div>
      {detail&&<div className="vocab-editor"><button onClick={()=>setDetails(undefined)}>收起详情</button><h3>{detail.word}</h3><p>{detail.meaning}</p><p>{detail.example}</p><p>{detail.exampleTranslation}</p></div>}
    </>}
    <div className="vocab-bulk-footer"><strong>待提交 {draft?.changes.length??0} 个词</strong><span className="muted">{storageError?'草稿未能写入浏览器，请勿关闭页面':dirty?'草稿已保存，尚未发布':'没有待提交修改'}</span><button disabled={locked||!draft?.undo.length} onClick={undo}>撤销上一批</button><button disabled={busy||!dirty} onClick={()=>setReview(!review)}>{review?'收起修改':'查看修改'}</button><button className="primary" disabled={busy||!dirty||stale&&!draft?.submission} onClick={()=>{setReview(true);if(draft?.submission)void publish();else void preview();}}>{draft?.submission?'重试原批次提交':'保存并提交'}</button></div>
    {draft?.submission&&<p className="notice">正在核实原批次提交结果。草稿暂时锁定，请重试原批次，避免重复发布。</p>}
    {review&&draft&&<div className="vocab-editor vocab-review"><h2>本次等级调整</h2><label>本次备注（选填）<input maxLength={500} disabled={locked} value={draft.note} onChange={event=>change({...draft,note:event.target.value})}/></label><div className="vocab-table-wrap"><table><thead><tr><th>单词</th><th>原分类</th><th>调整后</th><th>操作</th></tr></thead><tbody>{draft.changes.map(item=><tr key={item.id}><td>{item.word}</td><td>{names[item.from]}</td><td>{names[item.to]}</td><td><button disabled={locked} onClick={()=>{change({...draft,changes:draft.changes.filter(value=>value.id!==item.id),undo:[...draft.undo.slice(-19),draft.changes]});setSelected(new Set());}}>撤销</button></td></tr>)}</tbody></table></div>
      {plan&&<><p>{plan.counts.map(value=>`${value.name}：${value.before} → ${value.after}`).join('；')}</p>{Boolean(plan.missingAudio.length)&&<p className="notice error">缺少 {plan.missingAudio.length} 个录音，无法发布。</p>}<button className="primary" disabled={locked||stale||Boolean(plan.missingAudio.length)} onClick={()=>void publish()}>确认提交全部 {plan.changes.length} 个调整</button></>}
      <button disabled={locked||!dirty} onClick={()=>{if(window.confirm('放弃本轮全部等级调整草稿？')){setDraft(newDraft(release?.version??draft.baseVersion));setPlan(undefined);setSelected(new Set());}}}>放弃本轮草稿</button>
    </div>}
  </div>;
}
