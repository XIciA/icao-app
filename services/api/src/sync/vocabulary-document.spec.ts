import { describe, expect, it } from 'vitest';

import { mergeVocabularyDocuments, vocabularyDocumentSchema } from './vocabulary-document';
import { vocabularyRetiredIds } from '@icao/contracts';

describe('vocabulary document merge', () => {
  it('keeps the newest state per word and newest test result', () => {
    const merged = mergeVocabularyDocuments(
      {
        schemaVersion: 1,
        words: {
          one: { status: 'known', favorite: false, updatedAt: '2026-07-13T01:00:00.000Z' },
          two: { status: 'vague', favorite: true, updatedAt: '2026-07-13T03:00:00.000Z' },
        },
        lastTest: { schemaVersion: 1, completedAt: '2026-07-13T02:00:00.000Z', total: 30, correct: 20, answers: [] },
        updatedAt: '2026-07-13T03:00:00.000Z',
      },
      {
        schemaVersion: 1,
        words: {
          one: { status: 'wrong', favorite: true, updatedAt: '2026-07-13T04:00:00.000Z' },
          two: { status: 'forgot', favorite: false, updatedAt: '2026-07-13T02:00:00.000Z' },
        },
        lastTest: { schemaVersion: 1, completedAt: '2026-07-13T05:00:00.000Z', total: 30, correct: 25, answers: [] },
        updatedAt: '2026-07-13T05:00:00.000Z',
      },
    );
    expect(merged.words.one).toMatchObject({ status: 'wrong', favorite: true });
    expect(merged.words.two).toMatchObject({ status: 'vague', favorite: true });
    expect(merged.lastTest?.correct).toBe(25);
    expect(merged.updatedAt).toBe('2026-07-13T05:00:00.000Z');
  });

  it('rejects malformed vocabulary documents', () => {
    expect(vocabularyDocumentSchema.safeParse({ schemaVersion: 1, words: {}, updatedAt: 'invalid' }).success).toBe(false);
  });

  it('does not resurrect removed cards when an older device pushes its stale full document', () => {
    const id=Object.entries(vocabularyRetiredIds).find(([,target])=>target===null)![0];
    const base={schemaVersion:1 as const,words:{},updatedAt:'2026-10-26T00:00:00.000Z'};
    const stale={...base,words:{[id]:{status:'known',favorite:true,updatedAt:'2026-10-25T00:00:00.000Z'}}};
    expect(mergeVocabularyDocuments(base,stale).words).toEqual({});
    expect(vocabularyDocumentSchema.parse(stale).words).toEqual({});
  });

  it('keeps later edits of a merged card instead of overwriting them from a stale alias', () => {
    const [oldId,target]=Object.entries(vocabularyRetiredIds).find(([,id])=>typeof id==='string')! as [string,string];
    const base={schemaVersion:1 as const,updatedAt:'2026-10-26T00:00:00.000Z'};
    const current={...base,words:{[target]:{status:'known',favorite:false,updatedAt:base.updatedAt}}};
    const stale={...base,words:{[oldId]:{status:'wrong',favorite:true,updatedAt:'2026-10-25T00:00:00.000Z'}}};
    expect(mergeVocabularyDocuments(current,stale).words).toEqual(current.words);
  });
  it('preserves learned status when an old device only favorites an unlearned alias, while allowing explicit canonical resets',()=>{
    const [oldId,target]=Object.entries(vocabularyRetiredIds).find(([,id])=>typeof id==='string')! as [string,string];
    const base={schemaVersion:1 as const,updatedAt:'2026-10-26T00:00:00.000Z'};
    const current={...base,words:{[target]:{status:'known',favorite:false,updatedAt:'2026-10-25T00:00:00.000Z'}}};
    const alias={...base,words:{[oldId]:{status:'new',favorite:true,updatedAt:base.updatedAt}}};
    expect(mergeVocabularyDocuments(current,alias).words[target]).toMatchObject({status:'known',favorite:true});
    const reset={...base,words:{[target]:{status:'new',favorite:false,updatedAt:base.updatedAt}}};
    expect(mergeVocabularyDocuments(current,reset).words[target]?.status).toBe('new');
  });
});
