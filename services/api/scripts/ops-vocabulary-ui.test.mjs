// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { VocabularyPage } from '../../../apps/ops/src/VocabularyPage';
const mocks=vi.hoisted(()=>({api:vi.fn(),response:vi.fn()}));
vi.mock('../../../apps/ops/src/api',()=>({opsApi:mocks.api,opsResponse:mocks.response}));
const release=JSON.parse(readFileSync(resolve(__dirname,'../../../content/vocabulary/live/release.json'),'utf8'));
release.dataset.books.forEach(book=>{book.words=book.words.slice(0,2);});
let element,root;
const button=(label)=>[...element.querySelectorAll('button')].find(value=>value.textContent===label);
const click=async value=>act(async()=>value.click());
beforeEach(async()=>{vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);element=document.createElement('div');document.body.append(element);root=createRoot(element);mocks.api.mockReset();mocks.api.mockImplementation(async path=>path.endsWith('/preview')?{content:release,checksum:'a'.repeat(64),missingAudio:[]}:release);await act(async()=>root.render(createElement(VocabularyPage,{onDirtyChange:vi.fn()})));});
afterEach(async()=>{await act(async()=>root.unmount());element.remove();vi.unstubAllGlobals();});
it('presents three books, preserves the selected word ID on relevel and requires an explicit publication after preview',async()=>{
  expect([...element.querySelectorAll('nav button')]).toHaveLength(3);
  await click(element.querySelector('.result-card'));
  const selects=element.querySelectorAll('.vocab-editor select');
  await act(async()=>{selects[1].value='icao5';selects[1].dispatchEvent(new Event('change',{bubbles:true}));});
  await click(button('检查并预览'));
  const payload=JSON.parse(mocks.api.mock.calls.find(call=>call[0].endsWith('/preview'))[1].body);
  expect(payload.edits[0].word.id).toBe(release.dataset.books[0].words[0].id);expect(payload.edits[0].word.bookId).toBe('icao5');
  expect(mocks.api.mock.calls.some(call=>call[0].endsWith('/publish'))).toBe(false);
  await click(button('确认保存并发布'));expect(mocks.api.mock.calls.at(-1)[0]).toBe('/v1/admin/vocabulary/publish');
  expect(element.textContent).toContain('已保存发布');
});
it('blocks publication with missing audio and keeps the current editor after a conflict',async()=>{
  await click(element.querySelector('.result-card'));
  mocks.api.mockResolvedValueOnce({content:release,checksum:'a'.repeat(64),missingAudio:['missing']});await click(button('检查并预览'));
  expect(button('确认保存并发布').disabled).toBe(true);expect(element.textContent).toContain('缺少 1 个录音');
  mocks.api.mockRejectedValueOnce(new Error('vocabulary_version_changed_reload'));await click(button('检查并预览'));
  expect(element.textContent).toContain('词库已被其他管理员更新');expect(element.querySelector('.vocab-editor input').value).toBe(release.dataset.books[0].words[0].word);
});
it('provides separate word/example MP3 inputs and the shipped CSP allows their authenticated blob previews',async()=>{
  await click(element.querySelector('.result-card'));expect(element.querySelectorAll('input[type=file]')).toHaveLength(2);expect(button('试听单词')).toBeTruthy();expect(button('试听例句')).toBeTruthy();
  expect(readFileSync(resolve(__dirname,'../../../infra/ops/static.Caddyfile'),'utf8')).toContain("media-src 'self' blob:;");
});
it('edits the surviving merge card in the same publication batch',async()=>{
  await click(element.querySelector('.result-card'));
  await act(async()=>{const mode=element.querySelector('.vocab-editor select');mode.value='merge';mode.dispatchEvent(new Event('change',{bubbles:true}));});
  const target=release.dataset.books[0].words[1];
  await act(async()=>{const select=element.querySelectorAll('.vocab-editor select')[1];select.value=target.id;select.dispatchEvent(new Event('change',{bubbles:true}));});
  await click(button('检查并预览'));const body=JSON.parse(mocks.api.mock.calls.find(call=>call[0].endsWith('/preview'))[1].body);
  expect(body.edits.map(edit=>edit.type)).toEqual(['merge','upsert']);expect(body.edits[0].targetId).toBe(target.id);expect(body.edits[1].word.id).toBe(target.id);
});
it('reuses an existing split component without creating a duplicate card or resetting it',async()=>{
  await click(element.querySelector('.result-card'));
  await act(async()=>{const mode=element.querySelector('.vocab-editor select');mode.value='split';mode.dispatchEvent(new Event('change',{bubbles:true}));});
  const target=release.dataset.books[0].words[1];
  await act(async()=>{const select=element.querySelector('.vocab-split select');select.value=target.id;select.dispatchEvent(new Event('change',{bubbles:true}));});
  await click(button('检查并预览'));const body=JSON.parse(mocks.api.mock.calls.find(call=>call[0].endsWith('/preview'))[1].body);
  expect(body.edits.map(edit=>edit.type)).toEqual(['delete','upsert']);expect(body.edits[1].word.id).not.toBe(target.id);
  expect(element.textContent).toContain('沿用现有记录');
});
