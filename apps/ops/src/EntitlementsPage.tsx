import { useState } from 'react';
import type { LocalOpsGrantPreview as OpsEntitlementGrantPreview } from '@icao/contracts/commerce-rules';
import { opsApi } from './api';
type Account = { accountId:string;phone:string;status:string };
type Balance = {total:number;available:number;allowance:{membershipExpiresAt:string|null;resetAt:string|null;bonus?:{available:number;expiresAt:string|null}};history:Array<{applied_at:string;membership_days:number;ai_points:number;reason:string}>};
const time=(value:string|null|undefined)=>value?new Date(value).toLocaleString('zh-CN'):'无';
const errors:Record<string,string>={allowance_already_full:'当前额度已满，无需补充。',ops_entitlement_preview_stale:'用户权益已变化，请重新查询后预览。',allowance_request_in_progress:'用户正在使用 AI，请稍后再补满。',invalid_ops_entitlement_preview:'请核对数值；原因至少填写8个字符。',ops_preview_invalid_or_expired:'预览已过期，请重新核对。'};
export function EntitlementsPage(){
  const [query,setQuery]=useState(''),[accounts,setAccounts]=useState<Account[]>([]),[account,setAccount]=useState<Account>(),[balance,setBalance]=useState<Balance>(),[environment,setEnvironment]=useState('production');
  const [days,setDays]=useState('7'),[points,setPoints]=useState('100'),[mode,setMode]=useState('gift'),[reason,setReason]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[preview,setPreview]=useState<OpsEntitlementGrantPreview>();
  async function run(work:()=>Promise<void>){if(busy)return;setBusy(true);setError('');setNotice('');try{await work();}catch(e){const code=e instanceof Error?e.message:'';setError(errors[code]??'操作未完成，请检查连接或重新查询后重试。');}finally{setBusy(false);}}
  async function load(a:Account, env=environment){setAccount(a);setBalance(undefined);setPreview(undefined);setBalance(await opsApi<Balance>(`/v1/admin/reports/accounts/${a.accountId}?environment=${env}`));}
  async function prepare(kind:'member'|'quota'){
    if(!account||!balance)return;
    const input={accountId:account.accountId,environment,membershipDays:kind==='member'?Number(days):0,aiPoints:kind==='quota'&&mode==='gift'?Number(points):0,aiMode:kind==='quota'?mode:'gift',reason};
    setPreview(await opsApi<OpsEntitlementGrantPreview>('/v1/admin/review-entitlements/preview',{method:'POST',body:JSON.stringify(input)}));
  }
  return <section><h1>用户权益</h1><p className="muted">仅修改选中的用户。赠送记录与真实购买订单分开保存。</p>
    <form className="report-filters" onSubmit={e=>{e.preventDefault();void run(async()=>{setAccount(undefined);setBalance(undefined);setPreview(undefined);setAccounts(await opsApi<Account[]>('/v1/admin/users/search',{method:'POST',body:JSON.stringify({query,reason:'管理员查询指定用户权益'})}));});}}>
      <label>手机号／用户ID／订单号<input required minLength={3} value={query} onChange={e=>setQuery(e.target.value)}/></label>
      <label>权益环境<select disabled={busy} value={environment} onChange={e=>{setEnvironment(e.target.value);setBalance(undefined);setAccount(undefined);setPreview(undefined);}}><option value="production">正式用户</option><option value="sandbox">TestFlight 测试权益</option></select></label><button className="primary" disabled={busy}>搜索</button>
    </form>
    {error?<p role="alert" className="notice error">{error}</p>:null}{notice?<p role="status" className="notice success">{notice}</p>:null}
    {accounts.map(a=><button className="account-choice" key={a.accountId} disabled={busy||a.status!=='active'} onClick={()=>void run(()=>load(a))}>{a.phone} · {a.accountId} · {a.status==='active'?'正常':a.status}</button>)}
    {account&&balance?<><div className="rules-group"><h2>当前用户</h2><p>{account.phone} · {account.accountId}</p><p>会员到期：{time(balance.allowance.membershipExpiresAt)}</p><p>周期额度：{balance.available} / {balance.total} · 重置时间：{time(balance.allowance.resetAt)}</p><p>额外赠送：{balance.allowance.bonus?.available??0} 单位 · 最早到期：{time(balance.allowance.bonus?.expiresAt)}</p><button disabled={busy} onClick={()=>void run(()=>load(account))}>刷新权益</button></div>
      <fieldset disabled={busy||!!preview} className="rules-fields"><label>操作原因（至少8个字符）<input value={reason} minLength={8} maxLength={500} onChange={e=>setReason(e.target.value)} placeholder="例如：补偿本次服务异常消耗"/></label>
        <div className="rules-group"><h2>赠送会员</h2><label>赠送天数<input type="number" min={1} max={366} value={days} onChange={e=>setDays(e.target.value)}/></label><p>{[7,31,93].map(v=><button type="button" key={v} onClick={()=>setDays(String(v))}>{v}天</button>)}</p><p className="muted">有效会员顺延；免费或已到期用户从授予时起算。不重复重置已有周额度。</p><button className="primary" disabled={reason.trim().length<8} onClick={()=>void run(()=>prepare('member'))}>核对赠送会员</button></div>
        <div className="rules-group"><h2>补充 AI 额度</h2><label>方式<select value={mode} onChange={e=>setMode(e.target.value)}><option value="gift">额外增加（30天有效）</option><option value="refill">补满当前周期额度</option></select></label>{mode==='gift'?<label>增加单位<input type="number" min={1} max={100000} value={points} onChange={e=>setPoints(e.target.value)}/></label>:<p>预计补充 {balance.total-balance.available} 单位；不改变额度上限或重置时间。</p>}<button className="primary" disabled={reason.trim().length<8} onClick={()=>void run(()=>prepare('quota'))}>核对补充额度</button></div>
      </fieldset>
      {preview?<div className="notice confirm-panel" role="region" aria-label="确认权益变更"><h2>确认本次变更</h2><p>用户：{account.accountId} · {environment==='production'?'正式权益':'测试权益'}</p><p>赠送会员：{preview.change.membershipDays}天 · 操作后到期：{time(preview.after.membership.expiresAt)}</p><p>补充额度：{preview.change.aiPoints}单位 · {preview.change.aiMode==='refill'?'沿用当前周期':'新增额度30天有效'}</p><p>原因：{reason}</p><button disabled={busy} className="primary" onClick={()=>void run(async()=>{await opsApi(`/v1/admin/review-entitlements/${preview.previewId}/execute`,{method:'POST',body:JSON.stringify({confirmation:'确认发放',confirmationToken:preview.confirmationToken})});setPreview(undefined);await load(account);setNotice('已完成，服务器权益已生效。用户端获取最新权益后更新显示。');})}>{busy?'正在保存…':'确认执行'}</button> <button disabled={busy} onClick={()=>setPreview(undefined)}>返回修改</button></div>:null}
      <h2>操作记录</h2><div className="rules-table-scroll"><table className="rules-table"><thead><tr><th>时间</th><th>赠送天数</th><th>补充单位</th><th>原因</th></tr></thead><tbody>{balance.history.map((r,i)=><tr key={i}><td>{time(r.applied_at)}</td><td>{r.membership_days}</td><td>{r.ai_points}</td><td>{r.reason}</td></tr>)}</tbody></table>{!balance.history.length?<p>暂无操作记录。</p>:null}</div>
    </>:<p className="muted">搜索后选择用户，查看和调整权益。</p>}
  </section>;
}
