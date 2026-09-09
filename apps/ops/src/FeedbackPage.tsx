import type { OpsFeedbackQueueItem } from '@icao/contracts';
import type { OpsFeedbackDetail, OpsFeedbackListResponse, OpsFeedbackAttachment } from '@icao/contracts/feedback-ops';
import { useEffect, useRef, useState } from 'react';
import { opsApi, opsResponse } from './api';

const categoryLabel: Record<string, string> = { feature_suggestion: '功能建议', content_correction: '内容纠错', other: '其他' };
const date = (value: string) => new Date(value).toLocaleString('zh-CN', { hour12: false });
const failure = (cause: unknown) => cause instanceof Error && cause.message === 'feedback_not_found'
  ? '这条反馈已不在有效保留期内。' : '读取失败，请重试。';

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
  const loading = useRef(false);
  const mounted = useRef(true);
  async function load(cursor?: string) {
    if (loading.current) return;
    loading.current = true; setBusy(true); setError(undefined);
    try {
      const data = await opsApi<OpsFeedbackListResponse>(`/v1/admin/feedback${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`);
      if (!mounted.current) return;
      setItems((current) => cursor ? [...current, ...data.items.filter((next) => !current.some((row) => row.ticketNumber === next.ticketNumber))] : data.items);
      setNextCursor(data.nextCursor); setLoaded(true);
    } catch (cause) { if (mounted.current) setError(failure(cause)); }
    finally { loading.current = false; if (mounted.current) setBusy(false); }
  }
  useEffect(() => {
    mounted.current = true; void load();
    return () => { mounted.current = false; };
  }, []);
  useEffect(() => {
    setDetail(undefined); setDetailError(undefined);
    if (!selected) return;
    const controller = new AbortController();
    void opsApi<OpsFeedbackDetail>(`/v1/admin/feedback/${selected}`, { signal: controller.signal })
      .then((data) => { if (!controller.signal.aborted) setDetail(data); })
      .catch((cause) => { if (!controller.signal.aborted) setDetailError(failure(cause)); });
    return () => controller.abort();
  }, [selected, attempt]);
  return <section className="feedback-page">
    {selected ? <>
      <button className="link-button" onClick={() => setSelected(undefined)}>返回反馈列表</button>
      <h1>反馈详情</h1>
      {detailError && <p role="alert" className="notice error">{detailError} <button onClick={() => setAttempt((value) => value + 1)}>重试</button></p>}
      {!detail && !detailError && <p aria-live="polite">正在载入…</p>}
      {detail && <article className="feedback-detail">
        <div className="feedback-meta"><b>{detail.ticketNumber}</b><span>{categoryLabel[detail.category] ?? detail.category}</span><time>{date(detail.createdAt)}</time></div>
        <p className="feedback-description">{detail.description}</p>
        {detail.attachments.length > 0 && <div className="feedback-images">{detail.attachments.map((image) => <Attachment key={image.id} ticket={detail.ticketNumber} image={image} />)}</div>}
        <dl><dt>联系方式</dt><dd>{detail.contact || '未填写'}</dd>
          <dt>来源</dt><dd>{detail.source === 'study' ? '题目纠错' : '意见反馈'} · {detail.sourceRoute}</dd>
          <dt>版本与设备</dt><dd>{detail.appDisplayVersion} · {detail.platform} · {[detail.osName, detail.osVersion].filter(Boolean).join(' ')}</dd>
          {detail.question && <><dt>关联题目</dt><dd>{[detail.question.bankId, detail.question.categoryId, detail.question.topicId, detail.question.cardId].join(' / ')}<br />
            {detail.question.bankVersion ? `题库版本 ${detail.question.bankVersion}` : '题库版本未提供'} · {detail.question.verified ? '来源已核实' : '来源待核实'}
            {detail.question.bankChecksum && <small className="checksum">{detail.question.bankChecksum}</small>}</dd></>}
        </dl>
      </article>}
    </> : <>
      <h1>用户反馈</h1>
      <p className="muted">查看用户提交的建议与题目纠错。</p>
      {error && <p className="notice error" role="alert">{error} <button disabled={busy} onClick={() => void load(loaded ? nextCursor ?? undefined : undefined)}>重试</button></p>}
      <div className="result-list">{items.map((item) => <button className="result-card feedback-row" key={item.ticketNumber} onClick={() => setSelected(item.ticketNumber)}>
        <span><strong>{categoryLabel[item.category] ?? item.category}</strong><span>{item.summary}</span><small>{item.ticketNumber} · {date(item.createdAt)}</small></span><span aria-hidden>›</span>
      </button>)}</div>
      {!busy && loaded && items.length === 0 && <p className="muted">暂无反馈。</p>}
      {busy && <p aria-live="polite">正在载入…</p>}
      {nextCursor && <button className="primary feedback-more" disabled={busy} onClick={() => void load(nextCursor)}>查看更早的反馈</button>}
    </>}
  </section>;
}
