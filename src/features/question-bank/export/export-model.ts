import type { QuestionAnnotationEntry } from '../annotations/types';
import type { QuestionBankTextCard } from '../types';
export type ExportSentence={level:string;card:QuestionBankTextCard;annotation?:QuestionAnnotationEntry;learned:boolean};
export type ExportOptions={levels:string[];filter:'all'|'learned'|'annotated';tagIds:string[];translation:boolean;highlights:boolean;tags:boolean;notes:boolean};
export function selectedSentences(rows:ExportSentence[],options:ExportOptions) {
  return rows.filter(row=>options.levels.includes(row.level)&&(options.filter==='all'||options.filter==='learned'&&row.learned||options.filter==='annotated'&&Boolean(row.annotation?.note.trim()||row.annotation?.highlights.length||row.annotation?.tagIds.length)&&(!options.tagIds.length||options.tagIds.some(id=>row.annotation?.tagIds.includes(id)))));
}
