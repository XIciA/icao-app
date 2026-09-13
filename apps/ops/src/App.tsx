import { ReportsPage } from './ReportsPage';
import { EntitlementsPage } from './UsersPage';
import type { OpsStaffSession } from '@icao/contracts';
import { type FormEvent, type ReactNode, useEffect, useState } from 'react';
import { clearSession, opsApi, readSession, writeSession, OPS_SESSION_EXPIRED } from './api';
import { FeedbackPage } from './FeedbackPage';
import { AiRulesPage } from './AiRulesPage';

function ErrorNotice({ error }: { error?: string }) {
  return error ? <p className="notice error" role="alert">请求未完成：{error}</p> : null;
}

function Login({ onLogin }: { onLogin: (session: OpsStaffSession) => void }) {
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    const form = new FormData(event.currentTarget);
    try {
      const session = await opsApi<OpsStaffSession>('/v1/admin/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          email: form.get('email'),
          password: form.get('password'),
          totpCode: form.get('totpCode'),
          deviceName: navigator.userAgent.slice(0, 100),
        }),
      }, false);
      writeSession(session);
      onLogin(session);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'request_failed');
    } finally {
      setBusy(false);
    }
  }
  return <main className="login-shell">
    <section className="login-card">
      <div className="brand-mark">5</div>
      <p className="eyebrow">飞猪 ICAO · 内部系统</p>
      <h1>运营后台</h1>
      <p className="muted">仅限获授权的公司工作人员。所有查询与变更都会记录审计。</p>
      <form onSubmit={submit} className="form-stack">
        <label>公司邮箱<input name="email" type="email" autoComplete="username" required /></label>
        <label>独立密码<input name="password" type="password" autoComplete="current-password" minLength={12} required /></label>
        <label>动态验证码或恢复码<input name="totpCode" inputMode="numeric" autoComplete="one-time-code" required /></label>
        <ErrorNotice error={error} />
        <button className="primary" disabled={busy}>{busy ? '正在校验…' : '安全登录'}</button>
      </form>
    </section>
  </main>;
}

export type AiRulesPageProps = { onDirtyChange: (dirty: boolean) => void };
export function App({ renderAiRules }: { renderAiRules?: (props: AiRulesPageProps) => ReactNode } = {}) {
  const [session, setSession] = useState(readSession());
  const [local, setLocal] = useState(false);
  const [connecting, setConnecting] = useState(location.port === '4173');
  useEffect(() => { if (location.port !== '4173') return; void opsApi<{staff: OpsStaffSession['staff']}>('/local/session', {}, false).then(({staff}) => { setSession({staff} as OpsStaffSession); setLocal(true); }).catch(() => {}).finally(()=>setConnecting(false)); }, []);
  const [page, setPage] = useState<'feedback' | 'ai' | 'usage' | 'clicks' | 'entitlements'>('feedback');
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string>();
  useEffect(() => {
    const expired = () => { setSession(undefined); setDirty(false); setError(undefined); };
    window.addEventListener(OPS_SESSION_EXPIRED, expired);
    return () => window.removeEventListener(OPS_SESSION_EXPIRED, expired);
  }, []);
  useEffect(() => {
    if (!dirty) return;
    const leave = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', leave);
    return () => window.removeEventListener('beforeunload', leave);
  }, [dirty]);
  function mayLeave() { return !dirty || window.confirm('有尚未保存的 AI 规则修改，确定放弃吗？'); }
  function changePage(next: typeof page) {
    if (next === page || !mayLeave()) return;
    setDirty(false); setPage(next); setError(undefined);
  }
  async function logout() {
    if (!mayLeave()) return;
    try {
      await opsApi('/v1/admin/auth/logout', { method: 'POST' });
      clearSession(); setSession(undefined); setDirty(false);
    } catch (cause) { setError(cause instanceof Error ? cause.message : '退出失败，请重试'); }
  }
  if (!session && location.port === '4173') return <main className="login-shell"><section className="login-card"><h1>听你五个 · 管理后台</h1><p>{connecting ? '正在连接真实服务器…' : '连接暂不可用，请重新打开桌面的后台入口。'}</p><button onClick={()=>location.reload()}>重新连接</button></section></main>;
  if (!session) return <Login onLogin={setSession} />;
  return <main className="ops-shell">
    <header className="ops-header">
      <div className="ops-brand">听你五个 · 管理后台</div>
      <nav aria-label="管理功能" className="ops-tabs">
        <button className={page === 'feedback' ? 'active' : ''} aria-current={page === 'feedback' ? 'page' : undefined} onClick={() => changePage('feedback')}>用户反馈</button>
        {(['clicks','usage','ai','entitlements'] as const).map(key=><button key={key} className={page===key?'active':''} onClick={()=>changePage(key)}>{key==='clicks'?'点击统计':key==='usage'?'AI 用量与费用':key==='ai'?'AI 规则设置':'用户权益'}</button>)}
      </nav>
      <div className="ops-session"><span>{local ? "本地连接 · 正式数据" : session.staff.email}</span>{!local && <button className="link-button" onClick={() => void logout()}>退出</button>}</div>
    </header>
    <div className="ops-content"><ErrorNotice error={error} />
      {page === 'feedback' ? <FeedbackPage /> : page === 'usage' || page === 'clicks' ? <ReportsPage key={page} kind={page} /> : page === 'entitlements' ? <EntitlementsPage /> : session.staff.role !== 'admin'
        ? <p className="notice">当前账号没有调整 AI 额度的权限。</p>
        : renderAiRules?.({ onDirtyChange: setDirty }) ?? <AiRulesPage onDirtyChange={setDirty} />}
    </div>
  </main>;
}
