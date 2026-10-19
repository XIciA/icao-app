/** Text and references only. Remote content cannot define UI, code or paid question bodies. */
export type AppContentLegalId = 'agreement' | 'privacy' | 'thirdPartyServices';
export type AppContentLegalDocument = {
  id: AppContentLegalId;
  version: string;
  effectiveAt: string;
  consentVersion: string;
  title: string;
  intro: string;
  sections: { title: string; body: string }[];
  requiresReconsent: boolean;
  changeSummary?: string;
};
export type AppContentHotspotSource = {
  id: string;
  title: string;
  centers: string[];
  topics: { topicId: string; topicTitle: string; cardIds: string[] }[];
  kind: 'feedback' | 'general';
  orderId?: string;
};
export type AppContentHotspotBrief = {
  id: string;
  date: string;
  title: string;
  centers: string[];
  topics: { topicId: string; topicTitle: string; cardIds: string[] }[];
  sources?: AppContentHotspotSource[];
};
export type AppContentSnapshot = {
  schemaVersion: 1;
  version: number;
  publishedAt: string;
  hotspots: { generatedAt: string; briefs: AppContentHotspotBrief[] };
  help: { id: string; question: string; answer: string }[];
  legal: Record<AppContentLegalId, AppContentLegalDocument>;
};
export type AppContentRelease = { version: number; checksum: string; payload: AppContentSnapshot };

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function text(value: unknown, max: number) {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= max;
}
function date(value: unknown) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}
function items(value: unknown, max: number): value is unknown[] { return Array.isArray(value) && value.length <= max; }
function uniqueIds(values: Record<string, unknown>[]) { return new Set(values.map((item) => item.id)).size === values.length; }
function exactKeys(value: Record<string, unknown>, allowed: string[]) { return Object.keys(value).every((key) => allowed.includes(key)); }

export function isAppContentSnapshot(value: unknown): value is AppContentSnapshot {
  try {
    if (!record(value) || !exactKeys(value, ['schemaVersion', 'version', 'publishedAt', 'hotspots', 'help', 'legal'])
      || value.schemaVersion !== 1 || !Number.isSafeInteger(value.version) || Number(value.version) < 1
      || !text(value.publishedAt, 40) || !Number.isFinite(Date.parse(String(value.publishedAt)))) return false;
    if (!record(value.hotspots) || !exactKeys(value.hotspots, ['generatedAt', 'briefs']) || !text(value.hotspots.generatedAt, 40)
      || !items(value.hotspots.briefs, 1000)) return false;
    const briefs = value.hotspots.briefs;
    if (!briefs.every((brief) => record(brief) && exactKeys(brief, ['id', 'date', 'title', 'centers', 'topics', 'sources'])
      && text(brief.id, 160) && date(brief.date) && text(brief.title, 200)
      && items(brief.centers, 30) && brief.centers.length > 0 && brief.centers.every((item) => text(item, 100))
      && items(brief.topics, 100) && brief.topics.length > 0
      && new Set(brief.topics.map((topic) => record(topic) ? topic.topicId : undefined)).size === brief.topics.length && brief.topics.every((topic) => record(topic)
        && exactKeys(topic, ['topicId', 'topicTitle', 'cardIds']) && text(topic.topicId, 160) && text(topic.topicTitle, 200)
        && items(topic.cardIds, 500) && topic.cardIds.length > 0 && topic.cardIds.every((id) => text(id, 160))
        && new Set(topic.cardIds).size === topic.cardIds.length))) return false;
    if (!uniqueIds(briefs as Record<string, unknown>[])) return false;
    const sourceIds = new Set<string>();
    for (const raw of briefs) {
      const brief = raw as unknown as AppContentHotspotBrief;
      if (brief.sources === undefined) continue;
      if (!items(brief.sources, 500) || !brief.sources.length) return false;
      const expected = new Set(brief.topics.flatMap(t => t.cardIds.map(id => `${t.topicId}/${id}`)));
      const actual = new Set<string>();
      for (const source of brief.sources) {
        if (!record(source) || !exactKeys(source, ['id','title','centers','topics','kind','orderId'])
          || !text(source.id,160) || sourceIds.has(source.id) || !text(source.title,200)
          || !['feedback','general'].includes(source.kind) || (source.orderId !== undefined && !text(source.orderId,160))) return false;
        // Reuse the strict reference-only validator; source data can never contain question bodies.
        const sourceBrief = {id:source.id,date:brief.date,title:source.title,centers:source.centers,topics:source.topics};
        const nested = {...value,hotspots:{generatedAt:value.hotspots.generatedAt,briefs:[sourceBrief]}};
        if (!isAppContentSnapshot(nested)) return false;
        sourceIds.add(source.id);
        for (const topic of source.topics) for (const id of topic.cardIds) {
          if (!brief.topics.some(t=>t.topicId===topic.topicId&&t.topicTitle===topic.topicTitle)) return false;
          actual.add(`${topic.topicId}/${id}`);
        }
      }
      if (expected.size !== actual.size || [...actual].some(id=>!expected.has(id))) return false;
    }
    if (!items(value.help, 100) || !value.help.every((item) => record(item) && exactKeys(item, ['id', 'question', 'answer'])
      && text(item.id, 100) && text(item.question, 300) && text(item.answer, 5000)) || !uniqueIds(value.help as Record<string, unknown>[])) return false;
    if (!record(value.legal) || !exactKeys(value.legal, ['agreement', 'privacy', 'thirdPartyServices'])) return false;
    return (['agreement', 'privacy', 'thirdPartyServices'] as const).every((id) => {
      const document = (value.legal as Record<string, unknown>)[id];
      return record(document) && exactKeys(document, ['id', 'version', 'effectiveAt', 'consentVersion', 'title', 'intro', 'sections', 'requiresReconsent', 'changeSummary'])
        && document.id === id && text(document.version, 80) && text(document.consentVersion, 80) && date(document.effectiveAt)
        && text(document.title, 100) && text(document.intro, 5000) && typeof document.requiresReconsent === 'boolean'
        && (document.changeSummary === undefined || text(document.changeSummary, 2000))
        && items(document.sections, 100) && document.sections.length > 0
        && document.sections.every((section) => record(section) && exactKeys(section, ['title', 'body']) && text(section.title, 200) && text(section.body, 15000));
    });
  } catch { return false; }
}

export function isAppContentRelease(value: unknown): value is AppContentRelease {
  return record(value) && isAppContentSnapshot(value.payload) && value.version === value.payload.version
    && typeof value.checksum === 'string' && /^[a-f0-9]{64}$/.test(value.checksum);
}

/** Stable digest input across JSON files, JSONB and Native cache. */
export function canonicalAppContentJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalAppContentJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalAppContentJson((value as Record<string, unknown>)[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

export type LegalConsentReceipt = {
  accountId: string;
  agreementVersion: string;
  privacyVersion: string;
  agreementConsentVersion: string;
  privacyConsentVersion: string;
  releaseVersion: number;
  acceptedAt: string;
};
export type LegalConsentStatus = {
  accountId: string;
  releaseVersion: number;
  required: boolean;
  agreement: AppContentLegalDocument;
  privacy: AppContentLegalDocument;
  receipt: LegalConsentReceipt | null;
};
export function legalConsentMatches(receipt: LegalConsentReceipt | null | undefined, accountId: string,
  documents: { agreement: AppContentLegalDocument; privacy: AppContentLegalDocument }) {
  return Boolean(receipt && receipt.accountId === accountId && Number.isFinite(Date.parse(receipt.acceptedAt))
    && receipt.agreementConsentVersion === documents.agreement.consentVersion
    && receipt.privacyConsentVersion === documents.privacy.consentVersion);
}

/** One day is one directory entry. Source IDs remain usable as aliases and prompt keys. */
const nonCenterLabels = new Set(['多考点反馈','冬季运行专题','综合反馈']);
export function dailyHotspotTitle(date: string) {
  const [year,month,day]=date.split('-');
  return `${year}年${Number(month)}月${Number(day)}日 OPI 热点`;
}
export function hotspotCenters(brief: Pick<AppContentHotspotBrief,'centers'>) {
  return [...new Set(brief.centers.map(center=>center.trim()).filter(center=>center&&!nonCenterLabels.has(center)))];
}
export function hotspotSources(brief: AppContentHotspotBrief): AppContentHotspotSource[] {
  return brief.sources ?? [{id:brief.id,title:brief.title,centers:[...brief.centers],topics:brief.topics.map(t=>({...t,cardIds:[...t.cardIds]})),kind:brief.centers.length===1&&!nonCenterLabels.has(brief.centers[0]!)?'feedback':'general'}];
}
function unionHotspotTopics(sources: AppContentHotspotSource[]) {
  const groups = new Map<string,AppContentHotspotBrief['topics'][number]>();
  const owners = new Map<string,string>();
  for(const source of sources)for(const group of source.topics){
    const previous=groups.get(group.topicId);
    if(previous&&previous.topicTitle!==group.topicTitle)throw new Error('hotspot_topic_title_conflict');
    const next=previous??{...group,cardIds:[]};
    for(const id of group.cardIds){
      if(owners.has(id)&&owners.get(id)!==group.topicId)throw new Error('hotspot_card_topic_conflict');
      owners.set(id,group.topicId);if(!next.cardIds.includes(id))next.cardIds.push(id);
    }
    groups.set(group.topicId,next);
  }
  return [...groups.values()];
}
export function normalizeDailyHotspots(briefs: AppContentHotspotBrief[]): AppContentHotspotBrief[] {
  const days=new Map<string,AppContentHotspotBrief>();
  const usedSources=new Map<string,string>();
  for(const brief of briefs){
    const previous=days.get(brief.date);
    const sources=previous?.sources?[...previous.sources]:[];
    for(const raw of hotspotSources(brief)){
      const source={...raw,centers:[...raw.centers],topics:raw.topics.map(t=>({...t,cardIds:[...t.cardIds]}))};
      if(usedSources.has(source.id)&&usedSources.get(source.id)!==brief.date)throw new Error('hotspot_source_date_conflict');
      usedSources.set(source.id,brief.date);
      const existing=sources.find(s=>s.id===source.id);
      if(existing&&canonicalAppContentJson(existing)!==canonicalAppContentJson(source))throw new Error('hotspot_source_conflict');
      if(!existing)sources.push(source);
    }
    const centers=[...new Set(sources.flatMap(source=>hotspotCenters(source)))];
    days.set(brief.date,{id:previous?.id??brief.id,date:brief.date,title:dailyHotspotTitle(brief.date),centers:centers.length?centers:['综合反馈'],topics:unionHotspotTopics(sources),sources});
  }
  return [...days.values()].sort((a,b)=>b.date.localeCompare(a.date));
}
export function mergeHotspotFeedback(briefs: AppContentHotspotBrief[], incoming: AppContentHotspotBrief, orderId?: string) {
  const daily=normalizeDailyHotspots(briefs);
  const day=daily.find(b=>b.date===incoming.date);
  if(incoming.sources)throw new Error('feedback_cannot_replace_daily_sources');
  const source=hotspotSources(incoming)[0]!;
  if(orderId)source.orderId=orderId;
  if(!day)return normalizeDailyHotspots([...daily,{...incoming,id:`hotspot-${incoming.date}`,sources:[source]}]);
  const previous=day.sources!.find(s=>s.id===source.id);
  const merged=previous?{...previous,...source,title:previous.title,centers:[...new Set([...previous.centers,...source.centers])],topics:unionHotspotTopics([previous,source])}:source;
  const sources=previous?day.sources!.map(s=>s.id===source.id?merged:s):[...day.sources!,merged];
  return normalizeDailyHotspots(daily.map(b=>b.id===day.id?{...b,topics:unionHotspotTopics(sources),sources}:b));
}
export function selectHotspotSource(brief: AppContentHotspotBrief, selection: string): AppContentHotspotBrief {
  if(selection==='all')return brief;
  const sources=hotspotSources(brief).filter(s=>selection==='general'?s.kind==='general':s.kind==='feedback'&&s.centers.includes(selection));
  const centers=[...new Set(sources.flatMap(hotspotCenters))];
  return {...brief,centers:centers.length?centers:['综合反馈'],topics:unionHotspotTopics(sources),sources};
}
export function hotspotReportedPrompts(brief: AppContentHotspotBrief, card: {id:string;reportedPrompts?:Record<string,string[]>}) {
  const sources=hotspotSources(brief).filter(s=>s.topics.some(t=>t.cardIds.includes(card.id)));
  return [...new Set(sources.flatMap(s=>card.reportedPrompts?.[s.id]??[]))];
}
export function hotspotQuestionOrigins(brief: AppContentHotspotBrief, cardId: string) {
  return [...new Set(hotspotSources(brief).filter(s=>s.topics.some(t=>t.cardIds.includes(cardId))).flatMap(s=>s.kind==='general'?['本日综合反馈']:hotspotCenters(s)))];
}
/** v2 callers have strict keys and source-keyed reportedPrompts. Keep their links readable. */
export function compatibleHotspotBriefs(briefs: AppContentHotspotBrief[]): AppContentHotspotBrief[] {
  return briefs.flatMap(brief=>brief.sources?brief.sources.map(s=>({id:s.id,date:brief.date,title:dailyHotspotTitle(brief.date),centers:[...s.centers],topics:s.topics.map(t=>({...t,cardIds:[...t.cardIds]}))})):[brief]);
}
export function containsHotspotFeedback(briefs:AppContentHotspotBrief[], expected:AppContentHotspotBrief) {
  const sources=briefs.flatMap(hotspotSources);
  return hotspotSources(expected).every(wanted=>{
    const actual=sources.find(s=>s.id===wanted.id);
    return actual&&wanted.centers.every(c=>actual.centers.includes(c))&&wanted.topics.every(t=>t.cardIds.every(id=>actual.topics.some(a=>a.topicId===t.topicId&&a.topicTitle===t.topicTitle&&a.cardIds.includes(id))));
  });
}
