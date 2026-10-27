// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { VocabularyPage } from '../../../apps/ops/src/VocabularyPage';
const mocks=vi.hoisted(()=>({api:vi.fn(),response:vi.fn()}));
vi.mock('../../../apps/ops/src/api',()=>({opsApi:mocks.api,opsResponse:mocks.response}));
const baseline=JSON.parse(readFileSync(resolve(__dirname,'../../../content/vocabulary/live/release.json'),'utf8'));
let element,root,release,published;
const button=label=>[...element.querySelectorAll('button')].find(value=>value.textContent.replace(/\s/g,'')===label.replace(/\s/g,''));
const click=async element=>act(async()=>element.click());
const change=async(element,value)=>act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(element,value);element.dispatchEvent(new Event('input',{bubbles:true}));});
const firstVisible=()=>release.dataset.books.flatMap(book=>book.words).find(word=>`选择 ${word.word}`===element.querySelector('.vocab-bulk-list input').getAttribute('aria-label'));
const selectFirst=()=>click(element.querySelector('.vocab-bulk-list input[type=checkbox]'));
const render=async()=>act(async()=>root.render(createElement(VocabularyPage,{onDirtyChange:vi.fn(),actorId:'test-admin'})));
const mount=async()=>{element=document.createElement('div');document.body.append(element);root=createRoot(element);await render();};
beforeEach(async()=>{
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);localStorage.clear();vi.spyOn(window,'confirm').mockReturnValue(true);
  release=structuredClone(baseline);release.dataset.books.forEach(book=>{book.words=book.words.slice(0,3);});published=undefined;
  mocks.api.mockReset();mocks.api.mockImplementation(async(path,options)=>{
    if(path==='/v1/admin/vocabulary')return release;
    if(path.endsWith('/levels/preview')){const input=JSON.parse(options.body);return {baseVersion:input.baseVersion,checksum:'a'.repeat(64),changes:input.moves.map(move=>({id:move.id,from:release.dataset.books.flatMap(book=>book.words).find(word=>word.id===move.id).bookId,to:move.bookId,word:move.id})),counts:[],missingAudio:[]};}
    if(path.endsWith('/levels/publish')){published=JSON.parse(options.body);return {release:{...release,version:release.version+1},publishedVersion:release.version+1,alreadyPublished:false};}
    if(path.includes('/history'))return {items:[],nextCursor:null};
    throw new Error(path);
  });await mount();await click(button('批量调整等级'));
});
afterEach(async()=>{await act(async()=>root.unmount());element.remove();vi.restoreAllMocks();vi.unstubAllGlobals();});
it('accumulates moves across books, preserves the draft through history, and publishes the complete batch only after review',async()=>{
  await selectFirst();await click(button('移入ICAO 考前预习'));
  await click([...element.querySelectorAll('[aria-label="批量调整词书"] button')][2]);await selectFirst();await click(button('移入ICAO 4 必会'));
  expect(element.textContent).toContain('待提交 2 个词');expect(mocks.api.mock.calls.some(([path])=>path.endsWith('/levels/publish'))).toBe(false);
  await click(button('操作历史'));await click(button('批量调整等级'));expect(element.textContent).toContain('待提交 2 个词');
  await click(button('保存并提交'));const preview=JSON.parse(mocks.api.mock.calls.find(([path])=>path.endsWith('/levels/preview'))[1].body);
  expect(preview.moves.map(move=>move.bookId)).toEqual(['preview','icao4']);
  await change(element.querySelector('.vocab-review input'),'复核高频词');expect(button('确认提交全部 2 个调整')).toBeUndefined();
  await click(button('保存并提交'));await click(button('确认提交全部 2 个调整'));
  expect(published.moves).toEqual(preview.moves);expect(published.note).toBe('复核高频词');expect(element.textContent).toContain('已提交发布版本');expect(localStorage.length).toBe(0);
});
it('selects all filtered words, supports more than 100 moves, and clears selection when changing search or book',async()=>{
  const book=release.dataset.books[1],base=book.words[0];book.words=Array.from({length:120},(_,i)=>({...base,id:`fixture-${i}`,word:`fixture ${i}`}));
  await click(button('核对最新词库'));await click(element.querySelector('[aria-label="全选当前筛选结果"]'));expect(element.textContent).toContain('已选 120 个');
  await click(button('移入ICAO 5 冲刺'));await click(button('保存并提交'));
  const body=JSON.parse(mocks.api.mock.calls.find(([path])=>path.endsWith('/levels/preview'))[1].body);expect(body.moves).toHaveLength(120);
  await click(button('撤销上一批'));expect(element.textContent).toContain('待提交 0 个词');
  await selectFirst();await change(element.querySelector('[aria-label="搜索批量词条"]'),'fixture');expect(element.textContent).toContain('已选 0 个');
});
it('restores a browser draft after remount and removes a net-zero round trip',async()=>{
  const word=firstVisible();await selectFirst();await click(button('移入ICAO 考前预习'));
  await act(async()=>root.unmount());element.remove();await mount();await click(button('批量调整等级'));expect(element.textContent).toContain('待提交 1 个词');
  await click(element.querySelector('[aria-label="批量调整词书"] button'));
  await click([...element.querySelectorAll('.vocab-bulk-list input')].find(input=>input.getAttribute('aria-label')===`选择 ${word.word}`));await click(button('移入ICAO 4 必会'));
  expect(element.textContent).toContain('待提交 0 个词');
});
it('locks an ambiguous submission and retries exactly the same batch even after reload',async()=>{
  await selectFirst();await click(button('移入ICAO 5 冲刺'));await click(button('保存并提交'));
  mocks.api.mockRejectedValueOnce(new Error('network_unavailable'));await click(button('确认提交全部 1 个调整'));
  const first=JSON.parse(mocks.api.mock.calls.find(([path])=>path.endsWith('/levels/publish'))[1].body);
  expect(element.textContent).toContain('正在核实原批次提交结果');expect(element.querySelector('.vocab-bulk-list input').disabled).toBe(true);
  await act(async()=>root.unmount());element.remove();await mount();await click(button('批量调整等级'));await click(button('重试原批次提交'));
  expect(published).toEqual(first);expect(element.textContent).toContain('待提交 0 个词');
});
it('preserves a conflicting draft and requires choosing the current or drafted classification before rebasing',async()=>{
  const word=firstVisible();await selectFirst();await click(button('移入ICAO 5 冲刺'));
  release=structuredClone(release);release.version++;release.dataset.books[1].words=release.dataset.books[1].words.filter(value=>value.id!==word.id);release.dataset.books[0].words.push({...word,bookId:'preview',level:1});
  await click(button('核对最新词库'));expect(button('合入最新词库并保留调整').disabled).toBe(true);
  await click(button('保留草稿目标'));await click(button('合入最新词库并保留调整'));await click(button('保存并提交'));
  const body=JSON.parse(mocks.api.mock.calls.find(([path])=>path.endsWith('/levels/preview'))[1].body);expect(body.baseVersion).toBe(release.version);expect(body.moves).toEqual([{id:word.id,bookId:'icao5'}]);
});
it('shows formal history with Beijing dates, filtering, and before/after classifications',async()=>{
  const item={version:6,previousVersion:5,createdAt:'2026-10-27T12:00:00.000Z',actor:'owner@example.com',type:'levels',note:'复核',changeCount:1,levelChanges:[{id:'word-1',word:'gear',from:'icao4',to:'preview'}]};
  mocks.api.mockImplementation(async path=>path.includes('/history/6')?{...item,changes:[{id:'word-1',word:'gear',kind:'level',before:{bookId:'icao4',word:'gear',meaning:'起落架'},after:{bookId:'preview',word:'gear',meaning:'起落架'}}]}:{items:[item],nextCursor:null});
  await click(button('操作历史'));expect(element.textContent).toContain('owner@example.com');expect(element.textContent).toContain('20:00');
  await click(element.querySelector('.vocab-history-row'));expect(element.querySelector('.vocab-history-detail').textContent).toContain('起落架');
  await change(element.querySelector('.vocab-history-filters input'),'gear');await click(button('查询历史'));expect(mocks.api.mock.calls.at(-1)[0]).toContain('word=gear');
});
