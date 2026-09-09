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
export type AppContentHotspotBrief = {
  id: string;
  date: string;
  title: string;
  centers: string[];
  topics: { topicId: string; topicTitle: string; cardIds: string[] }[];
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
    if (!briefs.every((brief) => record(brief) && exactKeys(brief, ['id', 'date', 'title', 'centers', 'topics'])
      && text(brief.id, 160) && date(brief.date) && text(brief.title, 200)
      && items(brief.centers, 30) && brief.centers.length > 0 && brief.centers.every((item) => text(item, 100))
      && items(brief.topics, 100) && brief.topics.length > 0
      && new Set(brief.topics.map((topic) => record(topic) ? topic.topicId : undefined)).size === brief.topics.length && brief.topics.every((topic) => record(topic)
        && exactKeys(topic, ['topicId', 'topicTitle', 'cardIds']) && text(topic.topicId, 160) && text(topic.topicTitle, 200)
        && items(topic.cardIds, 500) && topic.cardIds.length > 0 && topic.cardIds.every((id) => text(id, 160))
        && new Set(topic.cardIds).size === topic.cardIds.length))) return false;
    if (!uniqueIds(briefs as Record<string, unknown>[]) || new Set(briefs.map((brief) => (brief as { date: string }).date)).size !== briefs.length) return false;
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
