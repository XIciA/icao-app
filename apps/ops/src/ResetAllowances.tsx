import { useRef, useState } from 'react';
import { opsApi } from './api';
type Preview={previewId:string;confirmationToken:string;count:number;environment:string;weeklyAllowance:number;trialAllowance:number};
export function ResetAllowances({onComplete}:{onComplete:()=>void}){
 const [environment,setEnvironment]=useState('production'),[reason,setReason]=useState(''),[preview,setPreview]=useState<Preview>(),[busy,setBusy]=useState(false),[message,setMessage]=useState('');const pending=useRef(false);
 async function run(execute=false){if(pending.current)return;pending.current=true;setBusy(true);setMessage('');try{
 if(execute&&preview){await opsApi(`/v1/admin/users/reset-allowances/${preview.previewId}/execute`,{method:'POST',body:JSON.stringify({confirmation:'确认重置所有用户额度',confirmationToken:preview.confirmationToken})});setMessage(`已完成：${preview.count} 个账户基础额度已恢复。`);setPreview(undefined);onComplete();}
 else setPreview(await opsApi<Preview>('/v1/admin/users/reset-allowances/preview',{method:'POST',body:JSON.stringify({environment,reason})}));
 }catch(e){const code=e instanceof Error?e.message:'';setMessage(code==='allowance_request_in_progress'?'部分用户正在使用 AI，本次未重置任何账户。请稍后重试。':code==='ai_usage_rule_preview_stale'?'规则已变化，请关闭确认并重新预览。':code==='ops_reset_accounts_changed'?'账户状态发生变化，请重新预览。':'操作未完成，请重新预览或重试；相同确认不会重复重置。');}finally{pending.current=false;setBusy(false);}}
 return <div className="rules-group reset-group"><h2>所有用户额度重置</h2><p className="muted">按当前已保存的规则恢复基础额度。会员期限、额外赠送和历史流水保持不变。范围为预览时仍有效的已注册账户，含体验额度已用完的普通用户。</p>
 <fieldset disabled={busy||!!preview} className="rules-fields"><div className="form-grid"><label>重置范围<select value={environment} onChange={e=>setEnvironment(e.target.value)}><option value="production">正式权益</option><option value="sandbox">TestFlight 测试权益</option></select></label><label>操作原因（至少3个字符）<input value={reason} maxLength={500} onChange={e=>setReason(e.target.value)}/></label></div></fieldset>
 {!preview?<button disabled={busy||reason.trim().length<3} className="danger-button" onClick={()=>void run()}>所有用户额度重置</button>:<div className="confirm-panel" role="region" aria-label="确认全员额度重置"><h3>即将重置 {preview.count} 个账户</h3><p>{preview.environment==='production'?'正式权益':'TestFlight 测试权益'} · 会员每周 {preview.weeklyAllowance} 单位 · 普通账户 {preview.trialAllowance} 单位。</p><p>基础额度恢复至 100%；若普通账户总额度设置为 0，则仍无可用额度。不会改变会员身份和额外赠送。</p><button className="danger-button" disabled={busy||preview.count===0} onClick={()=>void run(true)}>{busy?'正在执行…':'确认重置所有用户额度'}</button> <button disabled={busy} onClick={()=>setPreview(undefined)}>取消</button></div>}
 {message?<p role="status" className="notice">{message}</p>:null}</div>;
}
