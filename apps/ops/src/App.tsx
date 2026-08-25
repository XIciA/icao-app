import type {
  OpsAccountCommerceSummary,
  OpsEntitlementGrantPreview,
  OpsEntitlementGrantResult,
  OpsFeedbackQueueItem,
  OpsHealthSummary,
  OpsPrivacyRequestQueueItem,
  OpsStaffListItem,
  OpsStaffSession,
  OpsUserSummary,
} from '@icao/contracts';
import { FormEvent, useEffect, useMemo, useState } from 'react';

import { clearSession, opsApi, readSession, writeSession } from './api';

type Page = 'overview' | 'users' | 'queues' | 'grant' | 'audit';

const labels: Record<Page, string> = {
  overview: '总览',
  users: '用户与商业状态',
  queues: '反馈与隐私请求',
  grant: '审核账号权益发放',
  audit: '工作人员与审计',
};

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

function Overview({ session }: { session: OpsStaffSession }) {
  const [data, setData] = useState<OpsHealthSummary>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    void opsApi<OpsHealthSummary>('/v1/admin/health').then(setData).catch((value: Error) => setError(value.message));
  }, []);
  const cards = data ? [
    ['正式账号', data.counts.accounts],
    ['Production 订单', data.counts.productionOrders],
    ['待处理反馈', data.counts.pendingFeedback],
    ['待处理隐私请求', data.counts.pendingPrivacyRequests],
  ] : [];
  return <section>
    <p className="eyebrow">服务状态</p><h1>早上好，{session.staff.email}</h1>
    <p className="muted">这里用于运营判断，不替代服务端监控和告警。</p>
    <ErrorNotice error={error} />
    <div className="metric-grid">
      {cards.map(([label, value]) => <article className="metric" key={label}><span>{label}</span><strong>{value}</strong></article>)}
    </div>
    {data && <article className="status-line"><span className="status-dot" />API 与数据库可用 <code>{data.releaseId}</code></article>}
  </section>;
}

function Users({ reason }: { reason: string }) {
  const [query, setQuery] = useState('');
  const [users, setUsers] = useState<OpsUserSummary[]>([]);
  const [commerce, setCommerce] = useState<OpsAccountCommerceSummary>();
  const [error, setError] = useState<string>();
  async function search(event: FormEvent) {
    event.preventDefault(); setError(undefined); setCommerce(undefined);
    try {
      setUsers(await opsApi('/v1/admin/users/search', {
        method: 'POST',
        body: JSON.stringify({ query, reason }),
      }));
    } catch (value) { setError((value as Error).message); }
  }
  async function inspect(accountId: string) {
    setError(undefined);
    try {
      setCommerce(await opsApi(`/v1/admin/accounts/${accountId}/commerce`, {
        headers: { 'x-ops-reason': reason },
      }));
    } catch (value) { setError((value as Error).message); }
  }
  return <section><p className="eyebrow">受审计查询</p><h1>用户、订单、权益与点数</h1>
    <p className="muted">可使用手机号、内部账号 ID 或订单号精确查询；手机号和支付标识默认脱敏。</p>
    <form className="search-row" onSubmit={search}><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="手机号 / accountId / 订单号" required /><button className="primary" disabled={reason.length < 8}>查询</button></form>
    <ErrorNotice error={error} />
    <div className="result-list">{users.map((user) => <button className="result-card" key={user.accountId} onClick={() => void inspect(user.accountId)}>
      <span><strong>{user.phone}</strong><small>{user.accountId}</small></span><span className="pill">{user.status}</span>
    </button>)}</div>
    {commerce && <div className="detail-grid">
      <article><h2>当前权益</h2>{(['production', 'sandbox'] as const).map((environment) => <p key={environment}><b>{environment}</b> · 会员至 {commerce.entitlements[environment].membership.expiresAt ?? '未生效'} · {commerce.entitlements[environment].aiPoints.available} 点</p>)}</article>
      <article><h2>订单（支付标识脱敏）</h2>{commerce.orders.map((order) => <p key={order.id}><b>{order.environment}</b> · {order.productKey} · {order.status} · {order.externalOrderReference}</p>)}</article>
      <article><h2>最近点数账本</h2>{commerce.pointLedger.slice(0, 20).map((entry) => <p key={entry.sequence}>#{entry.sequence} · {entry.environment} · {entry.entryType} · {entry.direction} {entry.points}</p>)}</article>
    </div>}
  </section>;
}

function Queues({ reason }: { reason: string }) {
  const [feedback, setFeedback] = useState<OpsFeedbackQueueItem[]>([]);
  const [privacy, setPrivacy] = useState<OpsPrivacyRequestQueueItem[]>([]);
  const [error, setError] = useState<string>();
  async function load() {
    setError(undefined);
    try {
      const [nextFeedback, nextPrivacy] = await Promise.all([
        opsApi<OpsFeedbackQueueItem[]>('/v1/admin/feedback', { headers: { 'x-ops-reason': reason } }),
        opsApi<OpsPrivacyRequestQueueItem[]>('/v1/admin/privacy-requests', { headers: { 'x-ops-reason': reason } }),
      ]);
      setFeedback(nextFeedback); setPrivacy(nextPrivacy);
    } catch (value) { setError((value as Error).message); }
  }
  return <section><p className="eyebrow">工单队列</p><h1>反馈与隐私请求</h1>
    <p className="muted">只显示处理所需摘要，不展示 AI 正文、录音、完整支付凭证或诊断原文。</p>
    <button className="primary" disabled={reason.length < 8} onClick={() => void load()}>载入队列</button><ErrorNotice error={error} />
    <div className="two-columns"><article><h2>反馈</h2>{feedback.map((item) => <div className="queue-item" key={item.ticketNumber}><b>{item.ticketNumber}</b><span>{item.category} · {item.status}</span><p>{item.summary}</p></div>)}</article>
      <article><h2>隐私请求</h2>{privacy.map((item) => <div className="queue-item" key={item.id}><b>{item.requestType}</b><span>{item.status} · {item.identityProviderOutcome}</span><p>{item.accountId}</p></div>)}</article></div>
  </section>;
}

function Grant({ reason }: { reason: string }) {
  const [preview, setPreview] = useState<OpsEntitlementGrantPreview>();
  const [result, setResult] = useState<OpsEntitlementGrantResult>();
  const [error, setError] = useState<string>();
  async function makePreview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(undefined); setPreview(undefined); setResult(undefined);
    const form = new FormData(event.currentTarget);
    try {
      setPreview(await opsApi('/v1/admin/review-entitlements/preview', { method: 'POST', body: JSON.stringify({
        accountId: form.get('accountId'), environment: form.get('environment'), membershipDays: Number(form.get('membershipDays')), aiPoints: Number(form.get('aiPoints')), reason,
      }) }));
    } catch (value) { setError((value as Error).message); }
  }
  async function execute() {
    if (!preview) return;
    setError(undefined);
    try {
      setResult(await opsApi(`/v1/admin/review-entitlements/${preview.previewId}/execute`, { method: 'POST', body: JSON.stringify({ confirmation: '确认发放', confirmationToken: preview.confirmationToken }) }));
      setPreview(undefined);
    } catch (value) { setError((value as Error).message); }
  }
  return <section><p className="eyebrow">管理员高风险操作</p><h1>审核账号权益发放</h1><p className="muted">此入口只发放到已经存在且完成审核的账号。预览不会写入权益；执行需要在 10 分钟内明确二次确认。</p>
    <form className="form-grid" onSubmit={makePreview}><label>Account ID<input name="accountId" required /></label><label>环境<select name="environment"><option value="sandbox">Sandbox / TestFlight</option><option value="production">Production</option></select></label><label>会员天数<input name="membershipDays" type="number" min="0" max="366" defaultValue="31" /></label><label>AI 点数<input name="aiPoints" type="number" min="0" max="100000" defaultValue="0" /></label><button className="primary" disabled={reason.length < 8}>生成变更预览</button></form>
    <ErrorNotice error={error} />
    {preview && <article className="confirmation"><h2>二次确认</h2><p>账号 <code>{preview.change.accountId}</code></p><div className="before-after"><span>当前：会员至 {preview.before.membership.expiresAt ?? '未生效'}，{preview.before.aiPoints.available} 点</span><span>执行后：会员至 {preview.after.membership.expiresAt ?? '未生效'}，{preview.after.aiPoints.available} 点</span></div><button className="danger" onClick={() => void execute()}>确认发放</button></article>}
    {result && <p className="notice success">已执行并记录审计。调整编号：{result.adjustmentId}</p>}
  </section>;
}

function StaffAndAudit({ reason, session }: { reason: string; session: OpsStaffSession }) {
  const [staff, setStaff] = useState<OpsStaffListItem[]>([]);
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  async function load() {
    setError(undefined);
    try {
      const [nextStaff, nextAudit] = await Promise.all([
        opsApi<OpsStaffListItem[]>('/v1/admin/staff', { headers: { 'x-ops-reason': reason } }),
        opsApi<Array<Record<string, unknown>>>('/v1/admin/audit', { headers: { 'x-ops-reason': reason } }),
      ]);
      setStaff(nextStaff); setRows(nextAudit);
    } catch (value) { setError((value as Error).message); }
  }
  async function act(target: OpsStaffListItem, action: 'disable' | 'revoke') {
    const label = action === 'disable' ? '停用工作人员并撤销其全部会话' : '撤销该工作人员的全部会话';
    if (!window.confirm(`${label}：${target.email}？`)) return;
    setError(undefined); setNotice(undefined);
    try {
      await opsApi(`/v1/admin/staff/${target.id}/${action === 'disable' ? 'disable' : 'sessions/revoke-all'}`, {
        method: action === 'disable' ? 'PATCH' : 'POST',
        body: JSON.stringify({ reason }),
      });
      setNotice(`${label}已完成并记录审计。`);
      await load();
    } catch (value) { setError((value as Error).message); }
  }
  return <section><p className="eyebrow">仅管理员可见</p><h1>工作人员与不可变审计</h1>
    <p className="muted">工作人员创建暂由服务器一次性安全流程完成，避免页面回显 TOTP 密钥和恢复码。首发只创建一个负责人管理员；后续新增仍使用同一受审计流程。</p>
    <button className="primary" disabled={reason.length < 8} onClick={() => void load()}>载入工作人员与审计</button>
    <ErrorNotice error={error} />{notice && <p className="notice success">{notice}</p>}
    <div className="result-list">{staff.map((item) => <article className="staff-row" key={item.id}>
      <span><b>{item.email}</b><small>{item.role} · {item.status} · 活跃会话 {item.activeSessionCount}</small></span>
      <span className="staff-actions"><button disabled={reason.length < 8} onClick={() => void act(item, 'revoke')}>撤销会话</button><button className="danger" disabled={reason.length < 8 || item.status === 'disabled' || item.id === session.staff.id} onClick={() => void act(item, 'disable')}>停用</button></span>
    </article>)}</div>
    <h2 className="audit-heading">审计记录</h2><p className="muted">普通后台账号不能修改或删除审计记录。</p>
    <div className="result-list">{rows.map((row) => <div className="queue-item" key={String(row.sequence)}><b>#{String(row.sequence)} · {String(row.action)}</b><span>{String(row.actorRole ?? 'system')} · {String(row.createdAt)}</span><p>{String(row.reason)}</p></div>)}</div>
  </section>;
}

export function App() {
  const [session, setSession] = useState(readSession());
  const [page, setPage] = useState<Page>('overview');
  const [reason, setReason] = useState('');
  const nav = useMemo(() => (Object.keys(labels) as Page[]).filter((item) => session?.staff.role === 'admin' || !['grant', 'audit'].includes(item)), [session]);
  if (!session) return <Login onLogin={setSession} />;
  async function logout() { await opsApi('/v1/admin/auth/logout', { method: 'POST' }).catch(() => undefined); clearSession(); setSession(undefined); }
  async function revokeAllSessions() { await opsApi('/v1/admin/auth/sessions/revoke-all', { method: 'POST' }).catch(() => undefined); clearSession(); setSession(undefined); }
  return <div className="app-shell"><aside><div><div className="brand"><span>5</span><b>飞猪 ICAO</b></div><nav>{nav.map((item) => <button className={page === item ? 'active' : ''} key={item} onClick={() => setPage(item)}>{labels[item]}</button>)}</nav></div><div className="staff"><small>{session.staff.role === 'admin' ? '管理员' : '客服'}</small><span>{session.staff.email}</span><button onClick={() => void logout()}>退出</button></div></aside>
    <main className="content"><header><label>本次查询 / 操作原因<input value={reason} onChange={(event) => setReason(event.target.value)} minLength={8} maxLength={500} placeholder="至少 8 个字，写清工单或审核目的" /></label><span className={reason.length >= 8 ? 'reason-ok' : 'reason-needed'}>{reason.length >= 8 ? '原因已填写' : '敏感查询前必须填写'} · <button className="link-button" onClick={() => void revokeAllSessions()}>撤销全部设备</button></span></header>
      {page === 'overview' && <Overview session={session} />}{page === 'users' && <Users reason={reason} />}{page === 'queues' && <Queues reason={reason} />}{page === 'grant' && <Grant reason={reason} />}{page === 'audit' && <StaffAndAudit reason={reason} session={session} />}
    </main></div>;
}
