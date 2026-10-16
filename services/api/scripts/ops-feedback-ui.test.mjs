// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../../apps/ops/src/App';
import { OPS_SESSION_EXPIRED } from '../../../apps/ops/src/api';

const mocks = vi.hoisted(() => ({ api: vi.fn(), response: vi.fn(), session: { staff: { id: 'admin', email: 'owner@example.test', role: 'admin' }, expiresAt: '2030-01-01', accessToken: 'test-session' } }));
vi.mock('../../../apps/ops/src/api', () => ({
  opsApi: mocks.api, opsResponse: mocks.response, readSession: () => mocks.session,
  clearSession: vi.fn(), writeSession: vi.fn(), OPS_SESSION_EXPIRED: 'icao-ops-session-expired',
}));
const item = { ticketNumber: 'FB-260909-00000001', category: 'content_correction', source: 'study', createdAt: '2026-09-09T10:00:00Z', summary: '反馈摘要' };
const csp = readFileSync(resolve(__dirname, '../../../infra/ops/static.Caddyfile'), 'utf8')
  .match(/Content-Security-Policy "([^"]+)"/)[1];
let element; let root;
const button = (label) => Array.from(element.querySelectorAll('button')).find((value) => value.textContent === label);
async function click(value) { await act(async () => { value.click(); }); }

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  element = document.createElement('div'); document.body.append(element); root = createRoot(element);
  mocks.api.mockReset();
  mocks.response.mockReset();
  mocks.api.mockImplementation(async (path) => path.includes('FB-')
    ? { ...item, description: '反馈全文与所有说明', contact: 'contact@example.test', attachments: [], appDisplayVersion: '1.0.1', platform: 'ios' }
    : { items: [item], nextCursor: null });
});
afterEach(async () => { await act(async () => root.unmount()); element.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('minimal ops feedback experience', () => {
  it('allows authenticated attachment object URLs only for images and releases them on leaving detail', async () => {
    const directives = new Map(csp.split(';').map((value) => { const [name, ...sources] = value.trim().split(/\s+/); return [name, sources]; }));
    expect(directives.get('img-src')).toEqual(["'self'", 'data:', 'blob:']);
    for (const [name, sources] of directives) if (name !== 'img-src') expect(sources).not.toContain('blob:');
    expect(directives.get('script-src')).toEqual(["'self'"]);
    const imageUrl = 'blob:https://ops.example.test/feedback-image';
    const createObjectURL = vi.fn(() => imageUrl), revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });
    mocks.api.mockImplementation(async (path) => path.includes('FB-')
      ? { ...item, description: '反馈全文', attachments: [{ id: 'image-id' }] }
      : { items: [item], nextCursor: null });
    mocks.response.mockResolvedValue({ blob: async () => new Blob(['test-image'], { type: 'image/png' }) });
    await act(async () => { root.render(createElement(App)); });
    await click(element.querySelector('.feedback-row'));
    expect(mocks.response.mock.calls[0][0]).toBe(`/v1/admin/feedback/${item.ticketNumber}/attachments/image-id`);
    expect(element.querySelector('img').getAttribute('src')).toBe(imageUrl);
    await click(button('返回反馈列表'));
    expect(revokeObjectURL).toHaveBeenCalledWith(imageUrl);
  });
  it('shows focused business entries including content publishing and opens full feedback without exposing contact on the list', async () => {
    await act(async () => { root.render(createElement(App)); });
    expect(Array.from(element.querySelectorAll('nav button')).map((value) => value.textContent)).toEqual(['用户反馈', '内容发布', '点击统计', 'AI 用量与费用', 'AI 规则设置', '用户权益']);
    expect(element.textContent).toContain('反馈摘要'); expect(element.textContent).not.toContain('contact@example.test');
    await click(element.querySelector('.feedback-row'));
    expect(element.textContent).toContain('反馈全文与所有说明'); expect(element.textContent).toContain('contact@example.test');
    await click(button('返回反馈列表')); expect(element.textContent).toContain('反馈摘要');
    expect(element.textContent).not.toContain('反馈全文与所有说明');
  });
  it('protects unsaved AI inputs on tab changes and routes expired sessions to login', async () => {
    await act(async () => { root.render(createElement(App, { renderAiRules: ({ onDirtyChange }) => createElement('button', { onClick: () => onDirtyChange(true) }, '编辑额度') })); });
    await click(button('AI 规则设置')); await click(button('编辑额度'));
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    await click(button('用户反馈')); expect(button('编辑额度')).toBeTruthy(); expect(confirm).toHaveBeenCalledOnce();
    confirm.mockReturnValue(true); await click(button('用户反馈')); expect(button('编辑额度')).toBeUndefined();
    await act(async () => { window.dispatchEvent(new Event(OPS_SESSION_EXPIRED)); });
    expect(element.textContent).toContain('安全登录'); expect(element.querySelector('nav')).toBeNull();
  });
});
