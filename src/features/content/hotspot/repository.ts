import hotspotIndex from '@/../content/question-banks/opi-hotspots.json';

import type { OpiHotspotBrief, OpiHotspotIndex } from './types';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const index = hotspotIndex as OpiHotspotIndex;

function assertHotspotIndex(value: OpiHotspotIndex) {
  if (!value.generatedAt || !Array.isArray(value.briefs) || value.briefs.length === 0) {
    throw new Error('OPI 热点数据为空或格式错误。');
  }

  const briefIds = new Set<string>();
  const briefDates = new Set<string>();
  for (const brief of value.briefs) {
    if (!brief.id || briefIds.has(brief.id)) throw new Error(`OPI 热点资讯 ID 重复：${brief.id}`);
    if (!DATE_PATTERN.test(brief.date) || briefDates.has(brief.date)) {
      throw new Error(`OPI 热点资讯日期无效或重复：${brief.date}`);
    }
    if (!brief.title || brief.centers.length === 0 || brief.topics.length === 0) {
      throw new Error(`OPI 热点资讯内容不完整：${brief.id}`);
    }
    briefIds.add(brief.id);
    briefDates.add(brief.date);
  }
}

assertHotspotIndex(index);

const briefs = [...index.briefs].sort((a, b) => b.date.localeCompare(a.date));
const briefById = new Map(briefs.map((brief) => [brief.id, brief]));

export function loadHotspotBriefs(): OpiHotspotBrief[] {
  return briefs;
}

export function getHotspotBrief(briefId: string): OpiHotspotBrief | undefined {
  return briefById.get(briefId);
}
