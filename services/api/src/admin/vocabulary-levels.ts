import { BadRequestException } from '@nestjs/common';
import type { VocabularyWord } from '@icao/contracts';
import type { VocabularyLevelMove, VocabularyHistoryChange } from '@icao/contracts/vocabulary-admin';
import type { VocabularyLiveContent } from '@icao/contracts/vocabulary-live';
import type { VocabularyEdit } from '@icao/contracts/vocabulary-edit';

export function levelEdits(previous: VocabularyLiveContent, moves: VocabularyLevelMove[]): VocabularyEdit[] {
  const words = new Map(previous.dataset.books.flatMap(book => book.words.map(word => [word.id, word] as const)));
  const seen = new Set<string>();
  const edits: VocabularyEdit[] = [];
  for (const move of moves) {
    const word = words.get(move.id), book = previous.dataset.books.find(value => value.id === move.bookId);
    if (!word || !book || seen.has(move.id)) throw new BadRequestException('invalid_vocabulary_level_move');
    seen.add(move.id);
    if (word.bookId !== book.id) edits.push({ type: 'upsert', word: { ...word, bookId: book.id, level: book.level } });
  }
  if (!edits.length) throw new BadRequestException('vocabulary_no_level_changes');
  return edits;
}

export function vocabularyHistoryChanges(previous: VocabularyLiveContent | undefined, next: VocabularyLiveContent): VocabularyHistoryChange[] {
  if (!previous) return [];
  const before = new Map(previous.dataset.books.flatMap(book => book.words.map(word => [word.id, word] as const)));
  const after = new Map(next.dataset.books.flatMap(book => book.words.map(word => [word.id, word] as const)));
  const summary = (word: VocabularyWord) => ({ bookId: word.bookId, word: word.word, meaning: word.meaning });
  return [...new Set([...before.keys(), ...after.keys()])].flatMap(id => {
    const old = before.get(id), word = after.get(id);
    if (JSON.stringify(old) === JSON.stringify(word)) return [];
    const labels={word:'英文词条',meaning:'中文释义',example:'英文例句',exampleTranslation:'例句翻译',pronunciationText:'朗读文本',relatedExpressions:'相关表达',frequency:'词频'} as const;
    const fields=old&&word?Object.entries(labels).flatMap(([key,label])=>{const field=key as keyof typeof labels;const display=(value:unknown)=>Array.isArray(value)?value.join('；'):value&&typeof value==='object'?JSON.stringify(value):String(value??'');const before=display(old[field]),after=display(word[field]);return before===after?[]:[{label,before,after}];}):[];
    return [{ id, fields, word: word?.word ?? old!.word, ...(old ? { before: summary(old) } : {}), ...(word ? { after: summary(word) } : {}), kind: !old ? 'added' : !word ? 'deleted' : old.bookId !== word.bookId ? 'level' : 'content' } as VocabularyHistoryChange];
  });
}
