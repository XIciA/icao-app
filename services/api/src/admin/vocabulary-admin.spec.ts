import { describe, expect, it } from 'vitest';
import { VocabularyLiveService } from '../vocabulary/vocabulary-live.service';
import { liveWordFrequency, pronunciationPath } from './vocabulary-admin.service';
import { mp3Duration } from './vocabulary-audio.service';
import type { VocabularyWord } from '@icao/contracts';
const word={word:'precision',relatedExpressions:[]} as unknown as VocabularyWord;
describe('vocabulary publication boundaries',()=>{
  it('uses the exact player pronunciation normalization and protects whole-word boundaries',()=>{
    expect(pronunciationPath(' A / B (C) ')).toBe(pronunciationPath('A or B C'));
    const frequency=liveWordFrequency(word,[{bankId:'listening',version:2,checksum:'x',payload:{cards:[{id:'one',kind:'text',audioText:'Precision is needed. Non-precision is different.',referenceText:'precision'}]}}]);
    expect(frequency.occurrences).toBe(1);expect(frequency.cardCount).toBe(1);
  });
  it('counts whole synonym/phrase occurrences once and excludes Chinese labels and image cards',()=>{
    const frequency=liveWordFrequency({...word,word:'go around / missed approach',relatedExpressions:['go around']},[{bankId:'sentences900',version:1,checksum:'x',payload:{categories:[{title:'go around',topics:[{cards:[{id:'a',kind:'text',audioText:'Go-around. Missed approach.',referenceText:'Go around again.',choices:['go around']},{id:'image',kind:'image',audioText:'go around'}]}]}]}}]);
    expect(frequency.occurrences).toBe(4);expect(frequency.cardCount).toBe(1);
  });
  it('checks complete MP3 frames and rejects truncation, random bytes and undersized audio',()=>{
    const frame=Buffer.alloc(417);frame.set([255,251,144,0]);
    expect(mp3Duration(Buffer.concat(Array.from({length:20},()=>frame)))).toBeGreaterThan(500);
    expect(()=>mp3Duration(Buffer.concat(Array.from({length:20},()=>frame)).subarray(0,-4))).toThrow();
    expect(()=>mp3Duration(Buffer.alloc(2000))).toThrow();
    expect(()=>mp3Duration(frame)).toThrow();
  });
  it('loads the full packaged live baseline with the matching policy',()=>{
    const live=new VocabularyLiveService({} as never).baseline();
    expect(live.dataset.books.flatMap(book=>book.words)).toHaveLength(1659);
    expect(live.policy.version).toBe(live.version);expect(live.checksum).toMatch(/^[a-f0-9]{64}$/);
  });
});
