import { ResetAllowances } from './ResetAllowances';
import { OperationsTable } from './OperationsTable';
import type { AiRuleCatalog, AiRulePreview, AiRulePublishRequest, AiUsageRuleValues, AiUsageRuleVersion } from '@icao/contracts/commerce-rules';
import { type FormEvent, type ReactNode, useEffect, useRef, useState } from 'react';
import { opsApi } from './api';
import type { AiRulesPageProps } from './App';

const fields = [
  { key: 'weeklyAllowance', label: '会员每周额度', min: 1, max: 1_000_000 },
  { key: 'trialAllowance', label: '免费体验额度', min: 0, max: 1_000_000 },
  { key: 'transcription', label: '语音转写', min: 1, max: 100_000 },
  { key: 'grammar_correction', label: '语法纠错', min: 1, max: 100_000 },
  { key: 'opi_refinement', label: '表达润色', min: 1, max: 100_000 },
  { key: 'transcription_grammar', label: '转写＋语法纠错', min: 1, max: 100_000 },
  { key: 'transcription_opi', label: '转写＋表达润色', min: 1, max: 100_000 },
] as const;
type Field = typeof fields[number]['key'];
type Draft = Record<Field, string>;
const dateText = (value: string) => Date.parse(value) === 0 ? '初始默认规则' : new Date(value).toLocaleString('zh-CN', { hour12: false });
const fieldLabel = (field: string) => fields.find(({ key }) => key === field.replace(/^costs\./, ''))?.label ?? field;
const impactText = {
  all_users: '所有已注册用户及已有会员，下一次请求使用新规则',
  all_members: '生效后适用于已有会员及新购会员，已处理的请求不变',
  new_purchases: '仅适用于生效后的新购会员，已有会员保留原承诺',
  eligible_new_accounts: '仅适用于此后获得免费体验的新账号',
};

function draftFor(rule: AiUsageRuleValues): Draft {
  return Object.fromEntries(fields.map(({ key }) => [key, String(key in rule ? rule[key as 'weeklyAllowance' | 'trialAllowance'] : rule.costs[key as keyof typeof rule.costs])])) as Draft;
}
function parseDraft(draft: Draft) {
  const errors: Partial<Record<Field, string>> = {};
  fields.forEach(({ key, min, max }) => {
    if (!/^\d+$/.test(draft[key]) || Number(draft[key]) < min || Number(draft[key]) > max) errors[key] = `请输入 ${min}–${max.toLocaleString()} 的整数`;
  });
  const values: AiUsageRuleValues = {
    weeklyAllowance: Number(draft.weeklyAllowance), trialAllowance: Number(draft.trialAllowance),
    costs: {
      transcription: Number(draft.transcription), grammar_correction: Number(draft.grammar_correction),
      opi_refinement: Number(draft.opi_refinement), transcription_grammar: Number(draft.transcription_grammar),
      transcription_opi: Number(draft.transcription_opi),
    },
  };
  return { errors, values };
}
function errorText(cause: unknown) {
  const code = cause instanceof Error ? cause.message : '';
  if (code === 'ai_usage_rule_preview_stale') return '规则已被其他管理员更新，请重新读取后核对。你的输入仍然保留。';
  if (code === 'ai_usage_rule_effective_time_invalid') return '生效时间已过，请重新选择时间并预览。';
  if (code === 'ai_usage_rule_unchanged') return '所选生效时间下规则没有变化，请核对。';
  if (code === 'invalid_ai_usage_rule') return '数值或生效时间不符合要求，请检查输入。';
  return '请求未完成，请重试。你的修改尚未丢弃。';
}

function Dialog({ title, children, onClose, busy = false }: { title: string; children: ReactNode; onClose: () => void; busy?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = ref.current; dialog?.showModal(); return () => dialog?.close(); }, []);
  return <dialog className="rules-dialog" ref={ref} aria-label={title} onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}>
    <div className="rules-heading"><h2>{title}</h2><button type="button" className="link-button" disabled={busy} onClick={onClose}>关闭</button></div>
    {children}
  </dialog>;
}

export function AiRulesPage({ onDirtyChange }: AiRulesPageProps) {
  const [catalog, setCatalog] = useState<AiRuleCatalog>();
  const [draft, setDraft] = useState<Draft>();
  const [loadKey, setLoadKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [timing, setTiming] = useState<'now' | 'scheduled'>('now');
  const [scheduledAt, setScheduledAt] = useState('');
  const [history, setHistory] = useState(false);
  const [preview, setPreview] = useState<{ request: AiRulePublishRequest; result: AiRulePreview }>();
  const pendingRef = useRef(false);
  const changed = Boolean(catalog && draft && fields.some(({ key }) => draft[key] !== draftFor(catalog.current)[key]));
  useEffect(() => { onDirtyChange(changed); return () => onDirtyChange(false); }, [changed, onDirtyChange]);
  useEffect(() => {
    let active = true;
    setLoading(true);
    void opsApi<AiRuleCatalog>('/v1/admin/ai-rules').then((result) => {
      if (!active) return;
      setCatalog(result); setDraft((current) => current ?? draftFor(result.current)); setError('');
    }).catch((cause) => { if (active) setError(errorText(cause)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [loadKey]);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(''), 6000); return () => clearTimeout(timer); }, [notice]);

  if (loading && !catalog) return <section aria-busy="true"><h1>AI 规则设置</h1><p className="muted">正在读取规则…</p></section>;
  if (!catalog || !draft) return <section><h1>AI 规则设置</h1><p role="alert" className="notice error">{error || '规则暂时不可用'}</p><button className="primary" onClick={() => setLoadKey((key) => key + 1)}>重新读取</button></section>;
  const parsed = parseDraft(draft);
  const timeValid = timing === 'now' || (scheduledAt && Number.isFinite(Date.parse(scheduledAt)) && Date.parse(scheduledAt) > Date.now());
  const valid = Object.keys(parsed.errors).length === 0 && timeValid;

  function change(key: Field, value: string) {
    setDraft((current) => current ? { ...current, [key]: value } : current);
    setPreview(undefined); setNotice(''); setError('');
  }
  async function prepare(event: FormEvent) {
    event.preventDefault();
    if (pendingRef.current || !catalog || !draft || !valid || !changed) return;
    pendingRef.current = true; setBusy(true); setError('');
    const request: AiRulePublishRequest = {
      ...parsed.values, expectedVersionId: catalog.latestVersionId, idempotencyKey: crypto.randomUUID(),
      effectiveAt: timing === 'now' ? new Date().toISOString() : new Date(scheduledAt).toISOString(),
    };
    try {
      const result = await opsApi<AiRulePreview>('/v1/admin/ai-rules/preview', { method: 'POST', body: JSON.stringify(request) });
      setPreview({ request, result });
    } catch (cause) { setError(errorText(cause)); }
    finally { pendingRef.current = false; setBusy(false); }
  }
  async function publish() {
    if (pendingRef.current || !preview) return;
    pendingRef.current = true; setBusy(true); setError('');
    try {
      const saved = await opsApi<AiUsageRuleVersion>('/v1/admin/ai-rules/publish', { method: 'POST', body: JSON.stringify(preview.request) });
      setLoading(true); setPreview(undefined); setDraft(undefined); setTiming('now'); setScheduledAt('');
      onDirtyChange(false);
      setNotice(`已保存，生效时间：${dateText(saved.effectiveAt)}`);
      setCatalog(undefined); setLoadKey((key) => key + 1);
    } catch (cause) { setError(errorText(cause)); }
    finally { pendingRef.current = false; setBusy(false); }
  }
  function restore(version: AiUsageRuleVersion) {
    setDraft(draftFor(version)); setPreview(undefined); setHistory(false); setError(''); setNotice('');
  }

  return <section className="rules-page">
    <div className="rules-heading"><div><h1>AI 规则设置</h1><p className="muted">{Date.parse(catalog.current.effectiveAt) === 0 ? '当前使用初始默认规则' : `当前规则生效于 ${dateText(catalog.current.effectiveAt)}`}</p></div><button className="link-button" onClick={() => setHistory(true)}>历史版本</button></div>
    {notice ? <p role="status" className="notice success">{notice}</p> : null}
    {error && !preview ? <div role="alert" className="notice error">{error} <button className="link-button" disabled={loading || busy} onClick={() => setLoadKey((key) => key + 1)}>重新读取</button></div> : null}
    <form onSubmit={(event) => void prepare(event)}>
      <fieldset disabled={busy || loading} className="rules-fields">
        <div className="rules-group"><h2>总额度</h2><p className="muted">所有会员套餐使用同一周额度。内部单位仅在后台显示。</p><div className="form-grid">
          {fields.slice(0, 2).map(({ key, label, min, max }) => <label key={key}>{label}<input type="number" inputMode="numeric" min={min} max={max} step="1" value={draft[key]} onChange={(event) => change(key, event.target.value)} aria-invalid={Boolean(parsed.errors[key])} aria-describedby={`${key}-error`} /><span className="field-error" id={`${key}-error`}>{parsed.errors[key]}</span></label>)}
        </div></div>
        <div className="rules-group"><h2>功能消耗</h2><div className="rules-costs">
          {fields.slice(2).map(({ key, label, min, max }) => <div className="rules-cost-row" key={key}><label>{label}<input type="number" inputMode="numeric" min={min} max={max} step="1" value={draft[key]} onChange={(event) => change(key, event.target.value)} aria-invalid={Boolean(parsed.errors[key])} aria-describedby={`${key}-error`} /><span className="field-error" id={`${key}-error`}>{parsed.errors[key]}</span></label><p className="muted">{parsed.errors[key] || parsed.errors.weeklyAllowance ? '—' : `每次占周额度 ${(Number(draft[key]) / parsed.values.weeklyAllowance * 100).toFixed(1)}% · 约 ${Math.floor(parsed.values.weeklyAllowance / Number(draft[key]))} 次 / 周`}</p></div>)}
        </div></div>
        <div className="rules-group"><h2>生效时间</h2><label>生效方式<select value={timing} onChange={(event) => { setTiming(event.target.value as typeof timing); setPreview(undefined); }}><option value="now">确认保存后生效</option></select></label>
          {timing === 'scheduled' ? <label className="rules-time">指定生效时间<input type="datetime-local" value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} required />{!timeValid ? <span className="field-error">请选择未来的时间</span> : null}</label> : null}
          <p className="muted">所有用户统一适用新额度和功能消耗，包含已有会员。保留已使用额度，剩余百分比按新上限计算；调整规则不会重置消耗。</p>
        </div>
      </fieldset>
      <div className="rules-actions"><button className="primary" disabled={!changed || !valid || busy || loading}>{busy ? '正在处理…' : '预览并保存'}</button><button type="button" className="link-button" disabled={!changed || busy} onClick={() => { setDraft(draftFor(catalog.current)); setTiming('now'); setScheduledAt(''); setError(''); }}>放弃修改</button></div>
    </form>
    <ResetAllowances onComplete={() => setLoadKey(key => key + 1)} />
    <OperationsTable refresh={loadKey} />
    {preview ? <Dialog title="确认规则变更" busy={busy} onClose={() => { setPreview(undefined); setError(''); }}>
      <p className="muted">生效时间：{dateText(preview.result.effectiveAt)}</p>
      <div className="rules-table-scroll"><table className="rules-table"><thead><tr><th>项目</th><th>原值 → 新值</th><th>影响范围</th></tr></thead><tbody>{preview.result.changes.map((change) => <tr key={change.field}><td>{fieldLabel(change.field)}</td><td>{change.before} → {change.after}</td><td>{impactText[change.audience]}</td></tr>)}</tbody></table></div>
      {error ? <p role="alert" className="notice error">{error}</p> : null}
      <div className="rules-actions"><button className="primary" disabled={busy} onClick={() => void publish()}>{busy ? '正在保存…' : '确认保存'}</button><button className="link-button" disabled={busy} onClick={() => { setPreview(undefined); setError(''); }}>返回修改</button></div>
    </Dialog> : null}
    {history ? <Dialog title="规则历史" onClose={() => setHistory(false)}><p className="muted">恢复旧值会作为新版本预览发布，不改变已经发生的用量。</p><div className="rules-history">{catalog.versions.map((version) => <article key={version.id}><h3>{dateText(version.effectiveAt)}{version.id === catalog.current.id ? ' · 当前生效' : Date.parse(version.effectiveAt) > Date.now() ? ' · 待生效' : ''}</h3><p className="muted">操作者：{version.actorId ?? '初始配置'}</p><dl>{fields.map(({ key, label }) => <div key={key}><dt>{label}</dt><dd>{draftFor(version)[key]}</dd></div>)}</dl><button className="link-button" onClick={() => restore(version)}>使用这组数值</button></article>)}</div></Dialog> : null}
  </section>;
}
