import { useEffect, useState } from 'react';
import type { StabilityDashboard } from '@icao/contracts';
import { opsApi } from './api';
import { Occupancy, TrendChart, type ChartSeries } from './StabilityCharts';
import { aiRate, capabilityNames, costBuckets, monitorEvents, routeP95, shanghaiDay, stamp, statusCount } from './stability-data';
import './stability.css';

const categories = [{ id: 'all', name: '总览' }, { id: 'experience', name: '用户体验' }, { id: 'capacity', name: '资源与容量' }, { id: 'cost', name: '费用与到期' }, { id: 'recovery', name: '事件与恢复' }];
const pct = (n: number | null) => n == null ? '—' : `${n.toFixed(1)}%`;
const ago = (at: string, now: string) => (Date.parse(now) - Date.parse(at)) / 60_000;
function Stat({ label, value }: { label: string; value: string | number }) { return <div className="stability-stat"><span>{label}</span><strong>{value}</strong></div>; }
function External({ href, children }: { href: string; children: string }) { return <a href={href} target="_blank" rel="noopener noreferrer">{children} ↗</a>; }

export function StabilityPage({ onUsage }: { onUsage: () => void }) {
  const [data, setData] = useState<StabilityDashboard>();
  const [error, setError] = useState(false), [busy, setBusy] = useState(false);
  const [category, setCategory] = useState('all'), [days, setDays] = useState(1);
  async function refresh() { setBusy(true); try { setData(await opsApi<StabilityDashboard>('/v1/admin/stability')); setError(false); } catch { setError(true); } finally { setBusy(false); } }
  useEffect(() => { void refresh(); const timer = setInterval(() => void refresh(), 60_000); return () => clearInterval(timer); }, []);
  const now = new Date().toISOString();
  const to = data?.to ?? now;
  const from = days === 1 ? new Date(shanghaiDay(to) + 'T00:00:00+08:00').toISOString() : data?.from ?? to;
  const inRange = (at: string) => Date.parse(at) >= Date.parse(from) && Date.parse(at) <= Date.parse(to);
  const points = (data?.monitor?.points ?? []).filter(p => inRange(p.at));
  const latest = data?.monitor?.points.at(-1);
  const stale = !latest || ago(latest.at, now) > 15;
  const ai = (data?.ai ?? []).filter(r => inRange(r.at));
  const rate = aiRate(ai);
  const buckets = costBuckets(ai, days === 7);
  const costKnown = ai.some(r => r.estimatedCny != null);
  const estimated = ai.reduce((n, r) => n + (r.estimatedCny ?? 0), 0);
  const missingCost = ai.reduce((n, r) => n + r.missingCost, 0);
  const capabilities = [...new Set(ai.map(r => r.capability))];
  const aiSeries: ChartSeries[] = capabilities.map(capability => ({ label: capabilityNames[capability] ?? capability, points: ai.filter(r => r.capability === capability).map(r => ({ at: r.at, value: r.succeeded + r.failed ? r.succeeded / (r.succeeded + r.failed) * 100 : null, note: `${r.succeeded}/${r.succeeded + r.failed} 次已结束调用成功` })) }));
  const aiLatency: ChartSeries[] = capabilities.map(capability => ({ label: capabilityNames[capability] ?? capability, points: ai.filter(r => r.capability === capability).map(r => ({ at: r.at, value: r.p95Ms == null ? null : r.p95Ms / 1000, note: `${r.succeeded} 次成功调用；失败不计入耗时` })) }));
  const latencySeries: ChartSeries[] = ['v1/sync', 'v1/question-banks'].map(name => ({ label: name === 'v1/sync' ? '同步接口' : '题库接口', points: points.map(p => ({ at: p.at, value: routeP95(p, name) == null ? null : routeP95(p, name)! / 1000, note: `${p.api.routes[name]?.count ?? 0} 条响应；含非成功响应` })) }));
  const completed = points.reduce((n, p) => n + p.api.completed, 0), serverErrors = points.reduce((n, p) => n + statusCount(p, '5'), 0);
  const activity = data?.activity ?? [];
  const todayActive = data?.activity?.find(r => shanghaiDay(r.at) === shanghaiDay(to))?.accounts;
  const balance = data?.monitor?.deepseek;
  const balanceStale = !balance || ago(balance.at, now) > 120;
  const events = monitorEvents(points);
  const daysList = Array.from({ length: 7 }, (_, i) => shanghaiDay(new Date(Date.parse(to) - (6 - i) * 86400_000).toISOString()));
  const visible = (id: string) => category === 'all' || category === id;
  return <section className="stability-page">
    <div className="stability-heading"><h1>稳定性看板</h1><div className="stability-controls"><label>时间范围<select value={days} onChange={e => setDays(Number(e.target.value))}><option value={1}>今日</option><option value={7}>近 7 天</option></select></label><button type="button" disabled={busy} onClick={() => void refresh()}>{busy ? '读取中…' : '刷新'}</button></div></div>
    <div className="stability-tabs" aria-label="看板分类">{categories.map(c => <button key={c.id} aria-pressed={category === c.id} onClick={() => setCategory(c.id)}>{c.name}</button>)}</div>
    <div className="stability-freshness"><span>北京时间 · 更新 {stamp(data?.generatedAt)}</span><span className={stale ? 'stability-warning' : ''}>服务器采集 {stamp(latest?.at)}{stale ? ' · 未接入或已过期' : ''}</span></div>
    {error && <p className="notice error" role="alert">本次读取失败。{data ? '以下保留上次结果，请核对采集时间。' : '请刷新重试。'}</p>}
    {!data ? <p className="stability-empty">{busy ? '正在读取真实监控数据…' : '暂时没有可用数据'}</p> : <div className={`stability-grid ${category !== 'all' ? 'stability-single' : ''}`}>
      {visible('experience') && <article className="stability-panel">
        <h2>用户体验</h2><div className="stability-stats"><Stat label="AI 已结束调用成功率" value={pct(rate.rate)}/><Stat label="AI 已结束调用" value={data.ai ? `${rate.completed} 次` : '—'}/><Stat label="接口 5xx / 已完成请求" value={completed ? `${serverErrors} / ${completed}` : '—'}/></div>
        <TrendChart title="AI 每小时调用成功率" unit="%" series={aiSeries} percent from={from} to={to} gapMs={65 * 60_000}/>
        <TrendChart title="AI 成功调用每小时 P95" unit="秒" series={aiLatency} from={from} to={to} gapMs={65 * 60_000}/>
        <details open={category === 'experience'}><summary>同步 / 题库耗时与采集说明</summary><TrendChart title="服务端每五分钟 P95" unit="秒" series={latencySeries} from={from} to={to}/><p>AI 成功率＝成功调用 ÷（成功＋失败调用），共 {rate.completed} 次；一次用户操作可能产生多次调用。P95 表示窗口内 95% 样本不超过的耗时；AI 仅统计成功调用，服务端接口包含非成功响应。不把各窗口 P95 再平均。</p><p>手机启动、音频出声、客户端同步队列、支付到账完整耗时：未接入。以上为服务器与 AI 记录，不能代表手机端完整体验。</p><p>空白时段表示无采样；{points.some(p => p.api.truncated) ? '部分五分钟日志达到读取上限，接口统计可能不完整。' : '接口来源为有上限的应用日志采样。'}AI 来源：{data.sources.ai === 'ok' ? 'ai_usage_logs' : '本次不可用'}。</p></details>
      </article>}
      {visible('capacity') && <article className="stability-panel">
        <h2>资源与容量</h2><div className="stability-stats"><Stat label="今日有点击的账户" value={data.sources.activity === 'ok' ? `${todayActive ?? 0} 人` : '—'}/><Stat label="最近五分钟请求" value={stale ? '—' : `${latest!.api.completed} 次`}/><Stat label="磁盘可用" value={latest?.diskAvailableBytes == null ? '—' : `${(latest.diskAvailableBytes / 1024 ** 3).toFixed(1)} GiB`}/></div>
        <TrendChart title="服务器资源占用" unit="%" percent from={from} to={to} series={[
          { label: 'CPU', points: points.map(p => ({ at: p.at, value: p.cpuPercent })) },
          { label: '内存', points: points.map(p => ({ at: p.at, value: p.memoryPercent })) },
          { label: '磁盘', points: points.map(p => ({ at: p.at, value: p.diskPercent })) },
        ]}/>
        <div className="stability-chart-heading"><span>最近采集值{stale ? '（已过期 / 未接入）' : ''}</span></div>
        <Occupancy name="CPU" value={latest?.cpuPercent ?? null}/><Occupancy name="内存" value={latest?.memoryPercent ?? null}/><Occupancy name="磁盘" value={latest?.diskPercent ?? null}/>
        <TrendChart title="近七日每日有点击的账户" unit="人" bars from={data.from} to={to} gapMs={25 * 3600_000} series={[{ label: '自然日去重', points: activity.map(r => ({ at: r.at, value: r.accounts, note: `${r.clicks} 次点击；只覆盖已接入点击采集的使用` })) }]}/>
        <details><summary>负载与容量说明</summary><p>有点击账户按上海自然日去重；只覆盖已接入的点击事件，不等于完整日活或在线人数。当前并发、带宽占用、磁盘分类、承载人数上限：尚未采集或压测验证。</p><p>CPU 为两次采集间平均使用率；内存占用依据 MemAvailable；磁盘按普通进程可用容量计算。CPU 每核负载 {latest?.loadPerCpu ?? '—'}，该值不是 CPU 百分比。</p></details>
      </article>}
      {visible('cost') && <article className="stability-panel">
        <h2>费用与到期</h2><div className="stability-stats">{balance?.balances.length ? balance.balances.map(b => <Stat key={b.currency} label={`DeepSeek 余额${balanceStale ? '（旧值）' : ''}`} value={`${b.currency === 'CNY' ? '¥' : '$'}${b.total.toFixed(2)}`}/>) : <Stat label="DeepSeek 余额" value="未接入"/>}<Stat label="所选时段可估算费用" value={costKnown ? `¥${estimated.toFixed(4)}` : '—'}/></div>
        <TrendChart title={days === 7 ? 'AI 每日估算费用' : 'AI 每小时估算费用'} unit="元" bars from={from} to={to} gapMs={days === 7 ? 25 * 3600_000 : 65 * 60_000} series={[{ label: '用量估算', points: buckets.map(b => ({ at: b.at, value: b.value, note: `${b.missing} 条计费数据待确认` })) }]}/>
        <div className="stability-asset"><span><b>DeepSeek</b><small>余额采集 {stamp(balance?.at)}{balance ? ` · ${balance.available ? '余额接口显示可调用' : '余额接口显示不足'}` : ''}</small></span><External href="https://platform.deepseek.com/">余额与充值</External></div>
        <div className="stability-asset"><span><b>腾讯云语音识别</b><small>套餐余量 / 有效期：未接入</small></span><External href="https://console.cloud.tencent.com/asr">套餐管理</External></div>
        <div className="stability-asset"><span><b>阿里云主服务器</b><small>到期日 / 自动续费：未接入</small></span><External href="https://ecs.console.aliyun.com/">服务器续费</External></div>
        <div className="stability-asset"><span><b>域名、证书与其他服务</b><small>到期台账尚未接入</small></span></div>
        <details><summary>费用口径与明细</summary><p>共 {missingCost} 条计费数据缺失；可估算费用只合计已有费用记录，未扣套餐、免费额度、折扣，不能替代官方账单。历史刊例价沿用现有费用报表口径。{balanceStale ? '余额未接入或超过两小时未更新，不据此推算剩余天数。' : '余额与使用费来自不同来源，更新时间不同。'}</p><button className="link-button" onClick={onUsage}>打开现有 AI 用量与费用</button><p>维护链接进入官方控制台，需登录相应账户；没有自动续费或扣款操作。</p></details>
      </article>}
      {visible('recovery') && <article className="stability-panel">
        <h2>事件与恢复</h2><div className="stability-stats"><Stat label="距最近非空数据库备份" value={latest?.backupAgeHours == null ? '—' : `${latest.backupAgeHours.toFixed(1)} 小时`}/><Stat label="运行中的核心容器" value={latest ? `${latest.containers.filter(c => c.running).length} / ${latest.containers.length}` : '—'}/></div>
        <TrendChart title="数据库备份文件年龄" unit="小时" from={from} to={to} series={[{ label: '距最近备份', points: points.map(p => ({ at: p.at, value: p.backupAgeHours })) }]}/>
        <div className="stability-chart-heading"><span>近七天监测到的备份新鲜度</span></div>
        <div className="stability-backups">{daysList.map(day => { const samples = (data.monitor?.points ?? []).filter(p => shanghaiDay(p.at) === day && p.backupAgeHours != null); const fresh = samples.some(p => p.backupAgeHours! <= 30); return <div key={day}><span>{day.slice(5)}</span><b className={samples.length ? fresh ? 'fresh' : 'old' : ''}>{!samples.length ? '—' : fresh ? '有新鲜备份' : '超过30小时'}</b></div>; })}</div>
        <div className="stability-probes"><span>本机接口：{latest?.probes.api_local == null ? '未知' : latest.probes.api_local ? '可用' : '失败'}</span><span>公网接口：{latest?.probes.api_public == null ? '未知' : latest.probes.api_public ? '可用' : '失败'}</span>{stale && <span>采集已过期</span>}</div>
        <details open={category === 'recovery'}><summary>监控事件与容器状态</summary>{events.length ? <ol className="stability-timeline">{events.map((e, i) => <li key={`${e.at}-${i}`}><time>{stamp(e.at)}</time>{e.text}</li>)}</ol> : <p>所选采样中未记录到告警状态变化；采样空白不能证明没有故障。</p>}<div className="stability-containers">{latest?.containers.map(c => <div key={c.name}><span>{c.name}</span><span>{c.running ? c.health === 'healthy' || c.health === 'none' ? '运行' : c.health === 'starting' ? '启动中' : '健康异常' : '已停止'} · 重启 {c.restarts} 次</span></div>)}</div><p>备份年龄仅依据非空 dump 文件时间，不能证明恢复成功。异地副本、恢复验证、发布版本时间线尚未接入。公网检查也由本机执行，未接入独立外部探针。</p></details>
      </article>}
    </div>}
  </section>;
}
