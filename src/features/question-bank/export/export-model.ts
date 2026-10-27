import type { QuestionAnnotationEntry } from '../annotations/types';
import type { QuestionBankTextCard, QuestionBankTopic } from '../types';
import { SENTENCE_SCENARIOS, sentenceScenario } from '../lib/sentence-scenarios';
export type ExportBrowseMode = 'level' | 'scene';
export type ExportSentence={level:string;card:QuestionBankTextCard;annotation?:QuestionAnnotationEntry;learned:boolean};
export type ExportOptions={browseMode?:ExportBrowseMode;scenes?:string[];levels:string[];filter:'all'|'learned'|'annotated';tagIds:string[];translation:boolean;highlights:boolean;tags:boolean;notes:boolean};
/** Hydrating a topic must never widen the caller's exam scope. */
export function scopedExportCards(summary: QuestionBankTopic, topic: QuestionBankTopic) {
  const allowed = new Set(summary.scopeCardIds?.all ?? summary.cards.map(card => card.id));
  return topic.cards.filter((card): card is QuestionBankTextCard => allowed.has(card.id) && card.kind !== 'image' && !card.retired);
}
export function exportSceneChoices(rows: ExportSentence[]) {
  const available = new Set(rows.map(row => sentenceScenario(row.card.id)?.id));
  return SENTENCE_SCENARIOS.filter(scene => available.has(scene.id));
}
export function exportGroupTitle(row: ExportSentence, options: ExportOptions) {
  return options.browseMode === 'scene' ? sentenceScenario(row.card.id)?.name ?? '' : row.level;
}
export function selectedSentences(rows:ExportSentence[],options:ExportOptions) {
  const seen = new Set<string>();
  const chosen = rows.filter(row=>{
    const selected = options.browseMode === 'scene'
      ? (options.scenes ?? []).includes(sentenceScenario(row.card.id)?.id ?? '')
      : options.levels.includes(row.level);
    if (!selected || seen.has(row.card.id)) return false;
    seen.add(row.card.id);
    return options.filter==='all'||options.filter==='learned'&&row.learned||options.filter==='annotated'&&Boolean(row.annotation?.note.trim()||row.annotation?.highlights.length||row.annotation?.tagIds.length)&&(!options.tagIds.length||options.tagIds.some(id=>row.annotation?.tagIds.includes(id)));
  });
  // The fixed chapter ranges follow original sentence numbers, regardless of grade traversal.
  return options.browseMode === 'scene' ? chosen.sort((a,b)=>Number(a.card.id.split('-').at(-1))-Number(b.card.id.split('-').at(-1))) : chosen;
}
