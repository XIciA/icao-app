import type { WebCoursePromoCatalog } from './course-promo-catalog.web-data';

export type CourseContentRelease = { schemaVersion: 1; version: number; checksum: string; payload: WebCoursePromoCatalog };
const viewIds = ['icao4-initial', 'icao4-retake', 'icao4-preview', 'assessment', 'icao5'];
function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function text(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 15000;
}
function list(value: unknown): value is unknown[] {
  return Array.isArray(value) && value.length > 0 && value.length <= 200;
}
function strings(value: unknown) { return list(value) && value.every(text); }
function fields(value: unknown, names: string[]): value is Record<string, unknown> {
  return object(value) && names.every(name => text(value[name]));
}
function sections(value: unknown) {
  return list(value) && value.every(section => fields(section, ['title']) && strings(section.items));
}
function plans(value: unknown) {
  if (!list(value)) return false;
  const ids = new Set<string>();
  return value.every(plan => {
    if (!fields(plan, ['id', 'name', 'price', 'unit', 'description']) || ids.has(String(plan.id))) return false;
    ids.add(String(plan.id));
    return ['detailIntro', 'detailLabel'].every(key => plan[key] === undefined || text(plan[key]))
      && (plan.popular === undefined || typeof plan.popular === 'boolean')
      && (plan.outline === undefined || sections(plan.outline))
      && (plan.privileges === undefined || sections(plan.privileges));
  });
}
export function isCourseCatalog(value: unknown): value is WebCoursePromoCatalog {
  if (!object(value) || !fields(value.source, ['url', 'syncedAt', 'liveHtmlSha256'])) return false;
  if (!fields(value.hero, ['eyebrow', 'title', 'description']) || !list(value.hero.destinations)
    || !value.hero.destinations.every(item => fields(item, ['id', 'title', 'description'])
      && (item.id === 'advantages' || ((item.id === 'icao4' || item.id === 'icao5') && viewIds.includes(String(item.viewId)))))) return false;
  if (!fields(value.advantages, ['eyebrow', 'title', 'description']) || !list(value.advantages.items)
    || !value.advantages.items.every(item => fields(item, ['id', 'title', 'description', 'icon'])
      && ['trend', 'target', 'users', 'shield'].includes(String(item.icon)))) return false;
  if (!fields(value.pricing, ['eyebrow', 'standardOutlineNotice', 'detailFooterNote'])
    || !strings(value.pricing.tabViewIds) || !object(value.pricing.views)) return false;
  const tabs = value.pricing.tabViewIds as string[];
  if (new Set(tabs).size !== tabs.length || tabs.some(id => !viewIds.includes(id) || id === 'icao5')) return false;
  const views = value.pricing.views;
  if (!viewIds.every(id => fields(views[id], ['id', 'label', 'title', 'description'])
    && views[id].id === id && plans(views[id].plans))) return false;
  return fields(value.story, ['eyebrow', 'title', 'description', 'dialogTitle', 'dialogDescription', 'quote', 'footer'])
    && strings(value.story.paragraphs)
    && fields(value.contact, ['label', 'brand', 'footer']) && strings(value.contact.wechatIds);
}
export function isCourseRelease(value: unknown): value is CourseContentRelease {
  return object(value) && value.schemaVersion === 1 && Number.isSafeInteger(value.version)
    && Number(value.version) >= 1 && typeof value.checksum === 'string'
    && /^[a-f0-9]{64}$/.test(value.checksum) && isCourseCatalog(value.payload);
}
