import { useEffect, useRef, useState } from 'react';
import { stamp } from './stability-data';

export type ChartSeries = { label: string; points: { at: string; value: number | null; note?: string }[] };
const format = (v: number) => Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(1)}k` : Number(v.toPrecision(3)).toString();

export function TrendChart({ title, series, unit, percent = false, bars = false, from, to, gapMs = 6 * 60_000 }: {
  title: string; series: ChartSeries[]; unit: string; percent?: boolean; bars?: boolean; from: string; to: string; gapMs?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(360);
  const [hover, setHover] = useState<{ at: string; value: number; label: string; note?: string }>();
  useEffect(() => { const node = ref.current; if (!node) return; const observer = new ResizeObserver(entries => setWidth(Math.max(240, entries[0]!.contentRect.width))); observer.observe(node); return () => observer.disconnect(); }, []);
  const values = series.flatMap(s => s.points.flatMap(p => p.value == null ? [] : [p.value]));
  const rawMax = Math.max(...values, 0.01) * 1.05;
  const magnitude = 10 ** Math.floor(Math.log10(rawMax));
  const max = percent ? 100 : [1, 2, 5, 10].find(n => n * magnitude >= rawMax)! * magnitude;
  const L = 44, R = 14, T = 12, H = 172, B = 30, W = width, span = Math.max(1, Date.parse(to) - Date.parse(from));
  const x = (at: string) => L + (Date.parse(at) - Date.parse(from)) / span * (W - L - R);
  const y = (v: number) => T + (1 - v / max) * (H - T - B);
  return <div ref={ref} className="stability-chart">
    <div className="stability-chart-heading"><span>{title}（{unit}）</span><div className="stability-legend">{series.map((s, i) => <span key={s.label} className={`series-${i % 3}`}>{s.label}</span>)}</div></div>
    {!values.length ? <div className="stability-empty">所选时段暂无可绘制数据</div> : <>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title}；${series.map(s => s.label).join('、')}；时间均为北京时间`}>
        {[0, .5, 1].map(f => <g key={f}><line x1={L} x2={W - R} y1={y(max * f)} y2={y(max * f)} className="grid-line"/><text x={L - 7} y={y(max * f) + 4} textAnchor="end">{format(max * f)}</text></g>)}
        {[0, .5, 1].map((f, i) => <text key={i} x={L + f * (W - L - R)} y={H - 5} textAnchor={i === 0 ? 'start' : i === 2 ? 'end' : 'middle'}>{new Date(Date.parse(from) + span * f).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', ...(span > 2 * 86400_000 ? { month: '2-digit', day: '2-digit' } : { hour: '2-digit', minute: '2-digit', hour12: false }) })}</text>)}
        {series.map((s, index) => {
          let path = '', previous: { at: string; value: number | null } | undefined;
          for (const p of s.points) {
            if (p.value == null) { previous = undefined; continue; }
            const continuous = previous?.value != null && Date.parse(p.at) - Date.parse(previous.at) <= gapMs;
            path += `${continuous ? 'L' : 'M'}${x(p.at)},${y(p.value)} `; previous = p;
          }
          return <g key={s.label} className={`series-${index % 3}`}>
            {!bars && <path d={path} className="data-line"/>}
            {s.points.map((p, i) => p.value == null ? null : <g key={`${p.at}-${i}`}>
              {bars ? <rect x={Math.min(W - R - 4, Math.max(L, x(p.at) - 5))} y={y(p.value)} width={10} height={Math.max(0, y(0) - y(p.value))} rx={2} className="data-mark"/> : <circle cx={x(p.at)} cy={y(p.value)} r={s.points.length > 100 ? 1.5 : 2.5} className="data-mark"/>}
              <circle cx={x(p.at)} cy={y(p.value)} r={10} className="hit-mark" tabIndex={0} role="img" aria-label={`${stamp(p.at)} ${s.label} ${p.value} ${unit}${p.note ? ` ${p.note}` : ''}`} onMouseEnter={() => setHover({ at: p.at, value: p.value!, label: s.label, note: p.note })} onMouseLeave={() => setHover(undefined)} onFocus={() => setHover({ at: p.at, value: p.value!, label: s.label, note: p.note })} onBlur={() => setHover(undefined)}/>
            </g>)}
          </g>;
        })}
      </svg>
      <div className="stability-chart-detail" aria-live="polite">{hover ? `${stamp(hover.at)} · ${hover.label} ${format(hover.value)} ${unit}${hover.note ? ` · ${hover.note}` : ''}` : '悬停或点选数据点查看数值'}</div>
    </>}
  </div>;
}

export function Occupancy({ name, value, suffix = '%', note }: { name: string; value: number | null; suffix?: string; note?: string }) {
  return <div className="stability-meter"><span>{name}</span><div className="stability-track" role={value == null ? undefined : 'meter'} aria-label={name} aria-valuemin={0} aria-valuemax={100} aria-valuenow={value ?? undefined}><div style={{ width: `${Math.min(100, Math.max(0, value ?? 0))}%` }} /></div><span>{value == null ? '未接入' : `${value.toFixed(1)}${suffix}`}</span>{note && <small>{note}</small>}</div>;
}
