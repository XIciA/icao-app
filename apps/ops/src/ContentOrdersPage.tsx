import { useEffect, useState } from 'react';
import type { ContentOrder, ContentOrderKind, ContentOrderSummary } from '@icao/contracts/content-workflow';
import { opsApi, opsResponse } from './api';
const labels={opi:'OPI 热点',article:'资源分享文章',questions:'题库更新'};
const statuses={pending:'待处理',ready:'待审核',published:'已发布'};
type Card={id:string;audioText?:string;audioTextZh?:string;referenceText?:string;referenceTextZh?:string;audio?:string;image?:string;choices?:string[];correctChoiceIndex?:number;reportedPrompts?:Record<string,string[]>};
type Bank={categories:{topics:{cards:Card[]}[]}[]};
function cards(value:unknown){return (value as Bank).categories.flatMap(c=>c.topics.flatMap(t=>t.cards));}
function ResourcePreview({order,path,image=false}:{order:string;path:string;image?:boolean}) {
  const [requested,setRequested]=useState(image);
  const [url,setUrl]=useState<string>();const [error,setError]=useState(false);
  useEffect(()=>{if(!requested)return;let current=true;let objectUrl:string|undefined;
    void opsResponse(`/v1/admin/content-orders/${order}/resource?path=${encodeURIComponent(path)}`).then(r=>r.blob()).then(blob=>{if(current){objectUrl=URL.createObjectURL(blob);setUrl(objectUrl);}}).catch(()=>{if(current)setError(true);});
    return ()=>{current=false;if(objectUrl)URL.revokeObjectURL(objectUrl);};
  },[order,path,requested]);
  return !requested?<button onClick={()=>setRequested(true)}>加载试听</button>:error?<p role="alert">资源加载失败，请重新打开此工单重试。</p>:url?image?<img className="content-resource-image" src={url} alt="内容预览"/>:<audio controls preload="metadata" src={url}/>:<p className="muted">正在加载资源…</p>;
}
export function ContentOrdersPage({admin}:{admin:boolean}) {
  const [kind,setKind]=useState<ContentOrderKind>('opi');const [text,setText]=useState('');const [date,setDate]=useState('');const [center,setCenter]=useState('');
  const [orders,setOrders]=useState<ContentOrderSummary[]>([]);const [selected,setSelected]=useState<ContentOrder>();const [duplicate,setDuplicate]=useState<ContentOrder>();
  const [sources,setSources]=useState<{banks:{bankId:string;payload:unknown}[]}>();const [error,setError]=useState('');const [busy,setBusy]=useState(false);const [append,setAppend]=useState('');
  async function refresh(){setOrders(await opsApi<ContentOrderSummary[]>('/v1/admin/content-orders'));}
  useEffect(()=>{void refresh().catch(e=>setError(String(e)));},[]);
  useEffect(()=>{if(admin&&selected?.draft) void opsApi<{banks:{bankId:string;payload:unknown}[]}>('/v1/admin/content-orders/sources').then(setSources).catch(e=>setError(String(e)));},[admin,selected?.id,selected?.revision,selected?.draft]);
  async function run(operation:()=>Promise<void>){setBusy(true);setError('');try{await operation();await refresh();}catch(e){setError(e instanceof Error?e.message:'操作未完成，请重试');}finally{setBusy(false);}}
  async function action(name:string,extra:Record<string,unknown>={}){if(!selected)return;await run(async()=>{const order=await opsApi<ContentOrder>(`/v1/admin/content-orders/${selected.id}/${name}`,{method:'POST',body:JSON.stringify({revision:selected.revision,...extra})});setSelected(order);setAppend('');});}
  const draft=selected?.draft;
  const cardMap=new Map([...(sources?.banks??[]).flatMap(b=>cards(b.payload)),...(draft?.banks??[]).flatMap(b=>cards(b.payload))].map(c=>[c.id,c]));
  return <section className="content-orders"><div className="page-heading"><div><h1>内容发布</h1><p className="muted">提交内容后由开发者集中处理；整理完成后在这里查看并发布。</p></div><button onClick={()=>void run(refresh)} disabled={busy}>刷新</button></div>
    {error?<p role="alert" className="notice error">{error}</p>:null}
    <section className="panel"><h2>提交工单</h2><form className="form-stack" onSubmit={e=>{e.preventDefault();void run(async()=>{const result=await opsApi<{order:ContentOrder;duplicate:boolean}>('/v1/admin/content-orders',{method:'POST',body:JSON.stringify({kind,text,...(kind==='opi'?{examDate:date,center}:{})})});if(result.duplicate){setDuplicate(result.order);}else{setSelected(result.order);setText('');setDuplicate(undefined);}});}}>
      <label>内容类型<select value={kind} onChange={e=>{setKind(e.target.value as ContentOrderKind);setDuplicate(undefined);}}>{Object.entries(labels).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
      {kind==='opi'?<div className="content-form-row"><label>考试日期<input type="date" required value={date} onChange={e=>setDate(e.target.value)}/></label><label>考点<input required maxLength={100} value={center} onChange={e=>setCenter(e.target.value)}/></label></div>:null}
      <label>{kind==='article'?'粘贴文章（包含原标题即可）':'题目列表'}<textarea required rows={8} maxLength={200000} value={text} onChange={e=>setText(e.target.value)}/></label>
      <button className="primary" disabled={busy||!text.trim()}>提交</button>
      {duplicate?<div className="notice">这一天、这个考点已有工单。<button type="button" disabled={busy} onClick={()=>void run(async()=>{const next=await opsApi<ContentOrder>(`/v1/admin/content-orders/${duplicate.id}/append`,{method:'POST',body:JSON.stringify({revision:duplicate.revision,text})});setSelected(next);setText('');setDuplicate(undefined);})}>补充到已有工单</button></div>:null}
    </form></section>
    <div className="content-workspace"><section className="panel"><h2>工单列表</h2>{!orders.length?<p className="muted">暂无工单</p>:orders.map(order=><button className={`content-order-row ${selected?.id===order.id?'selected':''}`} key={order.id} disabled={busy} onClick={()=>void run(async()=>{setSelected(await opsApi<ContentOrder>(`/v1/admin/content-orders/${order.id}`));setAppend('');})}><strong>{order.kind==='opi'?`${order.examDate} · ${order.center}`:labels[order.kind]}</strong><span>{order.status==='ready'&&order.kind==='questions'?'可发布':statuses[order.status]} · 第 {order.revision} 版</span></button>)}</section>
      {selected?<section className="panel"><h2>{labels[selected.kind]} · {selected.status==='ready'&&selected.kind==='questions'?'可发布':statuses[selected.status]}</h2>
        <details><summary>查看提交原文</summary><pre className="content-original">{selected.text}</pre></details>
        {draft?<><p className="muted">{draft.notes}</p>
          {draft.article?<article className="content-article-preview"><span>{draft.article.category}</span><h1>{draft.article.title}</h1><ResourcePreview order={selected.id} path={draft.article.cover.publicPath} image/>{draft.article.blocks.map((block,i)=>block.type==='heading'?<h2 key={i}>{block.text}</h2>:block.type==='list'?block.ordered?<ol key={i}>{block.items.map((t,j)=><li key={j}>{t}</li>)}</ol>:<ul key={i}>{block.items.map((t,j)=><li key={j}>{t}</li>)}</ul>:<p key={i}>{block.type==='callout'&&block.title?<strong>{block.title}<br/></strong>:null}{block.text}</p>)}</article>:null}
          {draft.hotspot?<article className="content-hotspot-preview"><p>{draft.hotspot.date} · {draft.hotspot.centers.join('、')}</p><h2>{draft.hotspot.title}</h2>{draft.hotspot.topics.map(group=><section key={group.topicId}><h3>{group.topicTitle}</h3>{group.cardIds.map(id=><p key={id}>{cardMap.get(id)?.reportedPrompts?.[draft.hotspot!.id]?.join('\n')??cardMap.get(id)?.audioText??id}</p>)}</section>)}</article>:null}
          {draft.decisions.map((decision,index)=><div className="content-decision" key={index}><strong>{{original:'关联原题',similar:'同义问法',new:'新增题目',excluded:'已排除',unresolved:'待确认'}[decision.kind]}</strong> {decision.source}
            {decision.reason?<p>{decision.reason}</p>:null}
            {decision.kind==='unresolved'&&admin&&selected.status==='ready'?<button disabled={busy} onClick={()=>void action('exclude',{index})}>本次不发布此题</button>:null}
            {decision.cardId&&cardMap.get(decision.cardId)?<details><summary>查看练习题目、答案及音频</summary>{(()=>{const card=cardMap.get(decision.cardId!)!;return <>{card.image?<ResourcePreview order={selected.id} path={card.image} image/>:null}<p>{card.audioText}</p><p className="muted">{card.audioTextZh}</p>{card.choices?.map((choice,i)=><p key={i}>{i===card.correctChoiceIndex?'✓ ':''}{choice}</p>)}<p>{card.referenceText}</p><p className="muted">{card.referenceTextZh}</p>{card.audio?<ResourcePreview order={selected.id} path={card.audio}/>:null}</>;})()}</details>:null}
          </div>)}
          {admin&&selected.status==='ready'?<button className="primary" disabled={busy||draft.decisions.some(d=>d.kind==='unresolved')} onClick={()=>void action('publish')}>{busy?'正在发布…':'发布'}</button>:null}
        </>:<p className="muted">等待开发者处理。处理完成后可在这里查看结果。</p>}
        <details><summary>补充内容／修改意见</summary><textarea rows={4} value={append} onChange={e=>setAppend(e.target.value)}/><p className="muted">补充后重新进入待处理；已发布内容继续保留，直到新版本发布。</p><button disabled={busy||!append.trim()} onClick={()=>void action('append',{text:append})}>提交补充</button></details>
      </section>:null}
    </div>
  </section>;
}
