import type { QuestionBankAnnotationStore, QuestionBankCardTarget } from '../question-bank/annotations/types';
import type { RadioCatalog, RadioTrack } from './types';

export type RadioQueueFilter = { tags: boolean; tagIds: string[]; highlights: boolean; highlightIds: string[]; notes: boolean };
export const emptyRadioQueueFilter: RadioQueueFilter = { tags: false, tagIds: [], highlights: false, highlightIds: [], notes: false };
export const hasRadioQueueFilter = (filter: RadioQueueFilter) => filter.tags || filter.highlights || filter.notes;
const identity = (target: QuestionBankCardTarget) => JSON.stringify([target.bankId, target.categoryId, target.topicId, target.cardId]);
export const radioTrackIdentity = (track: RadioTrack) => identity({ ...track, cardId: track.id });

/** Definition IDs, rather than color names, are shared with My Annotations. */
export function matchingRadioAnnotations(store: QuestionBankAnnotationStore, filter: RadioQueueFilter) {
  const tags = new Set(store.tagDefinitions.map(item => item.id));
  const highlights = new Set(store.highlightDefinitions.map(item => item.id));
  return new Set(Object.values(store.entries).filter(entry =>
    (filter.tags && entry.tagIds.some(id => tags.has(id) && (!filter.tagIds.length || filter.tagIds.includes(id))))
    || (filter.highlights && entry.highlights.some(item => highlights.has(item.colorId) && (!filter.highlightIds.length || filter.highlightIds.includes(item.colorId))))
    || (filter.notes && Boolean(entry.note.trim())),
  ).map(identity));
}

export function filterRadioCatalogs(catalogs: RadioCatalog[], matches?: ReadonlySet<string>): RadioCatalog[] {
  if (!matches) return catalogs;
  // Retain empty banks so users can switch banks or clear an empty filter.
  return catalogs.map(catalog => ({ ...catalog, tracks: catalog.tracks.filter(track => matches.has(radioTrackIdentity(track))) }));
}

export type RadioDirectoryCategory = { id: string; title: string; tracks: RadioTrack[]; topics: { id: string; title: string; tracks: RadioTrack[] }[] };
export function radioDirectory(tracks: RadioTrack[]): RadioDirectoryCategory[] {
  const categories = new Map<string, RadioDirectoryCategory>();
  for (const track of tracks) {
    let category = categories.get(track.categoryId);
    if (!category) { category = { id: track.categoryId, title: track.categoryTitle, tracks: [], topics: [] }; categories.set(track.categoryId, category); }
    let topic = category.topics.find(item => item.id === track.topicId);
    if (!topic) { topic = { id: track.topicId, title: track.topicTitle, tracks: [] }; category.topics.push(topic); }
    category.tracks.push(track); topic.tracks.push(track);
  }
  return [...categories.values()];
}
