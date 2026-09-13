import { useEffect, useMemo, useState } from 'react';
import { opsApi } from './api';
const names: Record<string,string> = { transcribe:'语音转写', grammar_review:'语法纠错', polish:'表达优化', atc:'陆空通话', radiotelephony:'陆空通话', vocab:'单词学习', hotspot:'OPI热点', 'mock-exam':'模拟考试', bank_open:'打开题库', feature_open:'打开功能', audio_play:'播放音频', record:'录音', highlight:'高亮', tag:'标签', dictionary:'单词查询', transcription:'语音转写', analysis:'分析表达', membership_open:'开通／续费入口', purchase:'确认购买', grammar_correction:'语法纠错', opi_refinement:'表达优化', transcription_grammar:'转写＋纠错', transcription_opi:'转写＋表达优化', listening:'听力', sentences900:'900句', storytelling:'故事复诵', sentences:'900句', radio:'随身听', opi:'OPI', vocabulary:'单词学习', hotspots:'OPI热点', audio:'随身听', mock:'模拟考试', resources:'资源分享' };
export const label = (value: string) => names[value] ?? value;
const date = (days: number) => { const d = new Date(); d.setDate(d.getDate()-days); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
type Row = Record<string, string | number | null | undefined>;
function csv(rows: Row[]) {
  if (!rows.length) return;
  const headers = [...new Set(rows.flatMap(row=>Object.keys(row)))];
  const cell = (v: unknown) => `"${String(v ?? '').replace(/^\s*[=+@-]/, "'$&").replaceAll('"','""')}"`;
  const blob = new Blob(['\ufeff'+[headers.map(cell).join(','),...rows.map(row => headers.map(k=>cell(row[k])).join(','))].join('\r\n')], { type:'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='统计.csv'; a.click(); URL.revokeObjectURL(url);
}
export function ReportsPage({ kind }: { kind: 'clicks' | 'usage' }) {
  const [from,setFrom]=useState(date(6)),[to,setTo]=useState(date(0));
  const [account,setAccount]=useState(''),[feature,setFeature]=useState(''),[category,setCategory]=useState(''),[context,setContext]=useState(''),[status,setStatus]=useState('');
  const [rows,setRows]=useState<Row[]>([]),[note,setNote]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[detail,setDetail]=useState(false),[page,setPage]=useState(0),[descending,setDescending]=useState(true);
  async function query() {
    setBusy(true);setError('');setPage(0);
    try {
      const end=new Date(to+'T00:00:00');end.setDate(end.getDate()+1);
      const q = new URLSearchParams({from:new Date(from+'T00:00:00').toISOString(),to:end.toISOString(),account,feature,category,context,status});
      const data=await opsApi<{rows:Row[];note:string;truncated?:boolean}>(`/v1/admin/reports/${kind}?${q}`);
      setRows(data.rows);setNote(data.note+(data.truncated?' 本次超过10000条，请缩小日期范围后查询，当前合计仅覆盖已返回记录。':''));
    } catch {setError('查询失败，请检查连接与时间范围后重试。');setRows([]);} finally {setBusy(false);}
  }
  useEffect(()=>{void query();},[]);
  const shown=useMemo<Row[]>(()=>{
    if(kind==='clicks') return rows.map(r=>({'分类':r.category,'项目':label(String(r.event)),'题库／功能':label(String(r.context)),'点击次数':Number(r.clicks)}));
    if(detail) return rows.map(r=>({'时间':new Date(String(r.created_at)).toLocaleString('sv-SE', {timeZone:'Asia/Shanghai'}),'用户ID':r.account_id,'功能':label(String(r.capability)),'状态':r.status,'消耗单位':Number(r.quota_units),'预计费用（元）':r.estimated_cny ?? '待确认','输入Token':r.input_tokens,'输出Token':r.output_tokens,'音频秒数':r.audio_duration_seconds,'费用依据':r.cost_basis ?? '计费数据待确认'}));
    const grouped=new Map<string,Row>();
    for(const r of rows){const id=String(r.account_id);const g=grouped.get(id)??{'用户ID':id,'总消耗单位':0,'可估算费用（元）':0,'费用待确认条数':0};const k=label(String(r.capability));g[k+'（单位）']=Number(g[k+'（单位）']??0)+Number(r.quota_units);g['总消耗单位']=Number(g['总消耗单位'])+Number(r.quota_units);if(r.estimated_cny==null)g['费用待确认条数']=Number(g['费用待确认条数'])+1;else {g['可估算费用（元）']=Number(g['可估算费用（元）'])+Number(r.estimated_cny);g[k+'（元）']=Number(g[k+'（元）']??0)+Number(r.estimated_cny);}grouped.set(id,g);} return [...grouped.values()];
  },[rows,kind,detail]);
  const sortKey=kind==='clicks'?'点击次数':detail?'时间':'总消耗单位';
  const sorted=[...shown].sort((a,b)=> (typeof a[sortKey]==='number'?Number(a[sortKey])-Number(b[sortKey]):String(a[sortKey]).localeCompare(String(b[sortKey])))*(descending?-1:1));
  const columns=[...new Set(shown.flatMap(r=>Object.keys(r)))];
  return <section><h1>{kind==='clicks'?'点击统计':'AI 用量与费用'}</h1><p className="muted">只查看数据，不修改用户额度。</p>
    <form className="report-filters" onSubmit={e=>{e.preventDefault();void query();}}>
      <label>开始日期<input type="date" required value={from} onChange={e=>setFrom(e.target.value)}/></label><label>结束日期<input type="date" required value={to} onChange={e=>setTo(e.target.value)}/></label>
      {kind==='usage'?<><label>用户 ID<input value={account} onChange={e=>setAccount(e.target.value)} placeholder="全部用户"/></label><label>状态<select value={status} onChange={e=>setStatus(e.target.value)}><option value="">全部</option><option value="success">成功</option><option value="failed">失败</option></select></label></>:<><label>分类<select value={category} onChange={e=>setCategory(e.target.value)}><option value="">全部</option>{['题库入口','附加功能','学习工具','AI功能','会员'].map(v=><option key={v}>{v}</option>)}</select></label><label>题库／功能<select value={context} onChange={e=>setContext(e.target.value)}><option value="">全部</option>{['listening','sentences900','radiotelephony','opi','storytelling','vocab','hotspot','radio','mock-exam','resources'].map(v=><option key={v} value={v}>{label(v)}</option>)}</select></label></>}
      <label>项目<select value={feature} onChange={e=>setFeature(e.target.value)}><option value="">全部</option>{(kind==='usage'?['transcribe','grammar_review','polish']:['bank_open','feature_open','audio_play','record','highlight','tag','dictionary','transcription','analysis','membership_open','purchase']).map(v=><option key={v} value={v}>{label(v)}</option>)}</select></label>
      <button className="primary" disabled={busy}>{busy?'读取中…':'查询'}</button><button type="button" onClick={()=>{setAccount('');setFeature('');setCategory('');setContext('');setStatus('');setFrom(date(6));setTo(date(0));}}>重置条件</button>
    </form>{error?<p className="notice error" role="alert">{error}</p>:null}<p className="notice">{note}</p>
    <div className="rules-heading"><p>当前结果：{shown.length} 项 · {kind==='clicks'?`共 ${rows.reduce((n,r)=>n+Number(r.clicks),0)} 次点击`:`消耗 ${rows.reduce((n,r)=>n+Number(r.quota_units),0)} 单位；已可估算 ¥${rows.reduce((n,r)=>n+Number(r.estimated_cny??0),0).toFixed(4)}，${rows.filter(r=>r.estimated_cny==null).length} 条费用待确认`}</p><div>{kind==='usage'?<button onClick={()=>{setDetail(!detail);setPage(0);}}>{detail?'按用户汇总':'调用明细'}</button>:null} <button onClick={()=>setDescending(!descending)}>按{sortKey}{descending?'降序':'升序'} ↓↑</button> <button disabled={!shown.length} onClick={()=>csv(shown)}>导出 CSV</button></div></div>
    <div className="rules-table-scroll"><table className="rules-table"><thead><tr>{columns.map(k=><th key={k}>{k}</th>)}</tr></thead><tbody>{sorted.slice(page*20,page*20+20).map((r,i)=><tr key={i}>{columns.map(k=><td key={k}>{typeof r[k]==='number'&&!Number.isInteger(r[k])?Number(r[k]).toFixed(4):r[k]??'—'}</td>)}</tr>)}</tbody></table>{!shown.length&&!busy?<p className="empty-state">所选范围暂无数据。</p>:null}</div>
    <div className="rules-actions"><button disabled={!page} onClick={()=>setPage(page-1)}>上一页</button><span>{page+1} / {Math.max(1,Math.ceil(shown.length/20))}</span><button disabled={(page+1)*20>=shown.length} onClick={()=>setPage(page+1)}>下一页</button></div>
  </section>;
}
