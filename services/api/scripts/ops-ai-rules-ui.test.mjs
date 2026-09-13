// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AiRulesPage } from '../../../apps/ops/src/AiRulesPage';

const mocks = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('../../../apps/ops/src/api', () => ({ opsApi: mocks.api }));
const current = { id: '10000000-0000-4000-8000-000000000001', createdAt: '2026-09-01T00:00:00Z', effectiveAt: '2026-09-01T00:00:00Z', actorId: null, previousVersionId: null,
  weeklyAllowance: 500, trialAllowance: 100, costs: { transcription: 5, grammar_correction: 3, opi_refinement: 5, transcription_grammar: 8, transcription_opi: 10 } };
const earlier = { ...current, id: '10000000-0000-4000-8000-000000000002', weeklyAllowance: 300, effectiveAt: '2026-08-01T00:00:00Z' };
let element; let root; let dirty;
const button = (text) => Array.from(element.querySelectorAll('button')).find((value) => value.textContent === text);
const field = (label) => Array.from(element.querySelectorAll('label')).find((value) => value.firstChild?.textContent === label)?.querySelector('input');
async function click(target) { await act(async () => { target.click(); }); }
async function input(label, value) {
  await act(async () => {
    const target = field(label);
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(target, value);
    target.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
async function prepare() { await act(async () => element.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))); }
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; };
  element = document.createElement('div'); document.body.append(element); root = createRoot(element); dirty = vi.fn();
  mocks.api.mockReset();
  mocks.api.mockImplementation(async (path, options) => {
    if (path.includes('/users/operations')) return {rows:[],hasMore:false};
    if (path.endsWith('/preview')) {
      const request = JSON.parse(options.body);
      return { current, proposed: request, effectiveAt: request.effectiveAt, changes: [{ field: 'weeklyAllowance', before: 500, after: request.weeklyAllowance, audience: 'all_users' }] };
    }
    if (path.endsWith('/publish')) return { ...current, ...JSON.parse(options.body) };
    return { current, latestVersionId: current.id, versions: [current, earlier] };
  });
});
afterEach(async () => { await act(async () => root.unmount()); element.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('AI allowance editor', () => {
  it('requires changed valid values, previews impact and only publishes after confirmation', async () => {
    await act(async () => root.render(createElement(AiRulesPage, { onDirtyChange: dirty })));
    expect(button('预览并保存').disabled).toBe(true);
    await input('会员每周额度', '600');
    expect(dirty).toHaveBeenLastCalledWith(true);
    expect(element.textContent).toContain('约 120 次 / 周');
    await prepare();
    expect(element.querySelector('dialog[open]').textContent).toContain('500 → 600');
    expect(element.querySelector('dialog[open]').textContent).toContain('所有已注册用户及已有会员');
    expect(mocks.api.mock.calls.filter(([path]) => path.endsWith('/publish'))).toHaveLength(0);
    await click(button('确认保存'));
    expect(mocks.api.mock.calls.filter(([path]) => path.endsWith('/publish'))).toHaveLength(1);
    expect(element.textContent).toContain('已保存，生效时间');
    expect(dirty).toHaveBeenLastCalledWith(false);
  });
  it('keeps failed publication inputs and reuses exactly the same idempotency key on retry', async () => {
    await act(async () => root.render(createElement(AiRulesPage, { onDirtyChange: dirty })));
    await input('会员每周额度', '700'); await prepare();
    mocks.api.mockRejectedValueOnce(new Error('network_failure'));
    await click(button('确认保存'));
    expect(field('会员每周额度').value).toBe('700');
    expect(element.textContent).toContain('请求未完成，请重试');
    await click(button('确认保存'));
    const published = mocks.api.mock.calls.filter(([path]) => path.endsWith('/publish'));
    expect(published).toHaveLength(2);
    expect(published[0][1].body).toBe(published[1][1].body);
  });
  it('restores historical values into the form and requires the normal preview instead of publishing immediately', async () => {
    await act(async () => root.render(createElement(AiRulesPage, { onDirtyChange: dirty })));
    await click(button('历史版本'));
    const restoreButtons = Array.from(element.querySelectorAll('button')).filter((value) => value.textContent === '使用这组数值');
    await click(restoreButtons[1]);
    expect(field('会员每周额度').value).toBe('300');
    expect(element.querySelector('dialog')).toBeNull();
    expect(dirty).toHaveBeenLastCalledWith(true);
    expect(mocks.api.mock.calls.filter(([path]) => path === '/v1/admin/ai-rules')).toHaveLength(1);
    await input('语音转写', '0');
    expect(button('预览并保存').disabled).toBe(true);
    expect(field('语音转写').getAttribute('aria-invalid')).toBe('true');
  });
});
