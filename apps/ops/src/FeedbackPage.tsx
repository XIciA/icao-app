import type { OpsFeedbackQueueItem } from '@icao/contracts';
import type { OpsFeedbackDetail, OpsFeedbackListResponse, OpsFeedbackAttachment } from '@icao/contracts/feedback-ops';
import { useEffect, useRef, useState } from 'react';
import { opsApi, opsResponse } from './api';

const categoryLabel: Record<string, string> = { feature_suggestion: '功能建议', content_correction: '内容纠错', other: '其他', listening: '听力', sentences900: '900句', radiotelephony: '陆空通话', storytelling: '故事复述', opi: 'OPI' };
const sources: Record<string, string> = { profile: '意见反馈', study: '题目反馈', exam_report: '考情反馈', opi_hotspot: 'OPI 热点线索' };
const statuses: Record<string,string> = {received:'待处理',processing:'处理中',resolved:'已处理'};
const date = (value: string) => new Date(value).toLocaleString('zh-CN', { hour12: false });
const failure = (cause: unknown) => cause instanceof Error && cause.message === 'feedback_not_found'
  ? '这条反馈已不在有效保留期内。' : '读取失败，请重试。';

function ExamDetails({ item }: { item: OpsFeedbackQueueItem }) {
  if (item.source !== 'exam_report' || (!item.examDate && !item.examCenter)) return null;
  return <dl className="feedback-exam-details">
    {item.examDate && <><dt>考试时间</dt><dd>{item.examDate}</dd></>}
    {item.examCenter && <><dt>考点名称</dt><dd>{item.examCenter}</dd></>}
  </dl>;
}

function Attachment({ ticket, image }: { ticket: string; image: OpsFeedbackAttachment }) {
  const [url, setUrl] = useState<string>();
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let objectUrl: string | undefined;
    setError(false); setUrl(undefined);
    void opsResponse(`/v1/admin/feedback/${ticket}/attachments/${image.id}`, { signal: controller.signal })
      .then((response) => response.blob()).then((blob) => {
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob); setUrl(objectUrl);
      }).catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [ticket, image.id, attempt]);
  return <div className="feedback-image">{url
    ? <a href={url} target="_blank" rel="noreferrer"><img src={url} alt="用户提供的反馈截图" /></a>
    : error ? <button onClick={() => setAttempt((value) => value + 1)}>图片读取失败，重试</button> : <span>图片载入中…</span>}</div>;
}

export function FeedbackPage() {
  const [items, setItems] = useState<OpsFeedbackQueueItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [selected, setSelected] = useState<string>();
  const [detail, setDetail] = useState<OpsFeedbackDetail>();
  const [detailError, setDetailError] = useState<string>();
  const [attempt, setAttempt] = useState(0);
  const [sourceFilter, setSourceFilter] = useState('');
  const [statusFilter,setStatusFilter] = useState('');
  const [replyText,setReplyText] = useState('');
  const [replyStatus,setReplyStatus] = useState('received');
  const [saving,setSaving] = useState(false);
  const [saveError,setSaveError] = useState('');
  const replyKey = useRef<string | undefined>(undefined);
  const loading = useRef(false);
  const mounted = useRef(true);
  async function load(cursor?: string) {
    if (loading.current) return;
    loading.current = true; setBusy(true); setError(undefined);
    try {
      const data = await opsApi<OpsFeedbackListResponse>(`/v1/admin/feedback?${new URLSearchParams({...(cursor?{cursor}:{}),...(statusFilter?{status:statusFilter}:{}),...(sourceFilter?{source:sourceFilter}:{})})}`);
      if (!mounted.current) return;
      setItems((current) => cursor ? [...current, ...data.items.filter((next) => !current.some((row) => row.ticketNumber === next.ticketNumber))] : data.items);
      setNextCursor(data.nextCursor); setLoaded(true);
    } catch (cause) { if (mounted.current) setError(failure(cause)); }
    finally { loading.current = false; if (mounted.current) setBusy(false); }
  }
  useEffect(() => {
    mounted.current = true; void load();
    return () => { mounted.current = false; };
  }, [statusFilter, sourceFilter]);
  useEffect(() => {
    setReplyText('');setSaveError('');replyKey.current=undefined;
    setDetail(undefined); setDetailError(undefined);
    if (!selected) return;
    const controller = new AbortController();
    void opsApi<OpsFeedbackDetail>(`/v1/admin/feedback/${selected}`, { signal: controller.signal })
      .then((data) => { if (!controller.signal.aborted) {setDetail(data);setReplyStatus(data.status ?? 'received');} })
      .catch((cause) => { if (!controller.signal.aborted) setDetailError(failure(cause)); });
    return () => controller.abort();
  }, [selected, attempt]);
  async function saveReply() {
    if (!detail || saving) return;
    setSaving(true); setSaveError('');
    replyKey.current ??= crypto.randomUUID();
    try {
      const updated = await opsApi<OpsFeedbackDetail>(`/v1/admin/feedback/${detail.ticketNumber}/replies`, {
        method:'POST', headers:{'content-type':'application/json'},
        body:JSON.stringify({status:replyStatus,text:replyText.trim()||undefined,clientReplyId:replyKey.current}),
      });
      if(!mounted.current)return;
      setDetail(updated);setReplyText('');replyKey.current=undefined;
      setItems(old=>old.map(item=>item.ticketNumber===updated.ticketNumber?{...item,status:updated.status}:item));
    } catch { if(mounted.current)setSaveError('未能保存，请重试。'); }
    finally {if(mounted.current)setSaving(false);}
  }
  return <section className="feedback-page">
    {selected ? <>
      <button disabled={saving} className="link-button" onClick={() => {setSelected(undefined);void load();}}>返回反馈列表</button>
      <h1>反馈详情</h1>
      {detailError && <p role="alert" className="notice error">{detailError} <button onClick={() => setAttempt((value) => value + 1)}>重试</button></p>}
      {!detail && !detailError && <p aria-live="polite">正在载入…</p>}
      {detail && <article className="feedback-detail">
        <div className="feedback-meta"><b>{detail.ticketNumber}</b><span>{categoryLabel[detail.category] ?? detail.category}</span><time>{date(detail.createdAt)}</time></div>
        <p className="feedback-description"><strong>{sources[detail.source] ?? '意见反馈'}</strong>
          {detail.source === 'study' && (detail.question?.displayName ? <> · {detail.question.displayName}</> : ' · 题名暂无法核实，原始题目编号见下方')}
        </p>
        <ExamDetails item={detail} />
        <p className="feedback-description">{detail.description}</p>
        {detail.attachments.length > 0 && <div className="feedback-images">{detail.attachments.map((image) => <Attachment key={image.id} ticket={detail.ticketNumber} image={image} />)}</div>}
        <h2>处理回复</h2>
        {(detail.replies ?? []).map(reply=><div key={reply.id}><time>{date(reply.createdAt)}</time><p className="feedback-description">{reply.text}</p></div>)}
        <label>处理状态<select disabled={saving} value={replyStatus} onChange={event=>{setReplyStatus(event.target.value);replyKey.current=undefined;}}>{Object.entries(statuses).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
        <label>对用户回复<textarea disabled={saving} maxLength={1000} rows={4} value={replyText} placeholder="填写简短回复（选填）" onChange={event=>{setReplyText(event.target.value);replyKey.current=undefined;}}/></label>
        {saveError&&<p role="alert">{saveError}</p>}
        <button className="primary" disabled={saving} onClick={()=>void saveReply()}>{saving?'正在保存…':replyText.trim()?'保存并发送回复':'保存状态'}</button>
        <dl><dt>联系方式</dt><dd>{detail.contact || '未填写'}</dd>
          <dt>来源</dt><dd>{sources[detail.source] ?? '意见反馈'} · {detail.sourceRoute}</dd>
          <dt>版本与设备</dt><dd>{detail.appDisplayVersion} · {detail.platform} · {[detail.osName, detail.osVersion].filter(Boolean).join(' ')}</dd>
          {detail.question && <><dt>关联题目</dt><dd>{detail.question.displayName && <>{detail.question.displayName}<br />
            <small>{detail.question.displayNameSource === 'submitted_release' ? '反馈时题目名称' : '按当前题库定位的名称'}</small><br /></>}
            {[detail.question.bankId, detail.question.categoryId, detail.question.topicId, detail.question.cardId].join(' / ')}<br />
            {detail.question.bankVersion ? `题库版本 ${detail.question.bankVersion}` : '题库版本未提供'} · {detail.question.verified ? '来源已核实' : '来源待核实'}
            {detail.question.bankChecksum && <small className="checksum">{detail.question.bankChecksum}</small>}</dd></>}
        </dl>
      </article>}
    </> : <>
      <h1>用户反馈</h1>
      <label>反馈来源<select disabled={busy} value={sourceFilter} onChange={event => { setSourceFilter(event.target.value); setItems([]); setNextCursor(null); setLoaded(false); }}><option value="">全部来源</option>{Object.entries(sources).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <div className="feedback-filters">{[['','全部'],...Object.entries(statuses)].map(([value,label])=><button key={value} disabled={busy} aria-pressed={statusFilter===value} onClick={()=>{setStatusFilter(value ?? '');setItems([]);setNextCursor(null);setLoaded(false);}}>{label}</button>)}</div>
      {error && <p className="notice error" role="alert">{error} <button disabled={busy} onClick={() => void load(loaded ? nextCursor ?? undefined : undefined)}>重试</button></p>}
      <div className="result-list">{items.map((item) => <button className="result-card feedback-row" key={item.ticketNumber} onClick={() => setSelected(item.ticketNumber)}>
        <span><strong>{categoryLabel[item.category] ?? item.category} · {sources[item.source] ?? '意见反馈'}</strong><span>{item.summary}</span>{item.source === 'exam_report' && (item.examDate || item.examCenter) && <small>{[item.examDate, item.examCenter].filter(Boolean).join(' · ')}</small>}<small>{item.ticketNumber} · {date(item.createdAt)}</small></span><span>{statuses[item.status]??'待处理'} ›</span>
      </button>)}</div>
      {!busy && loaded && items.length === 0 && <p className="muted">暂无反馈。</p>}
      {busy && <p aria-live="polite">正在载入…</p>}
      {nextCursor && <button className="primary feedback-more" disabled={busy} onClick={() => void load(nextCursor)}>查看更早的反馈</button>}
    </>}
  </section>;
}
