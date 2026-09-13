// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { ResetAllowances } from '../../../apps/ops/src/ResetAllowances';
import { EntitlementsPage } from '../../../apps/ops/src/UsersPage';
const mocks=vi.hoisted(()=>({api:vi.fn()}));
vi.mock('../../../apps/ops/src/api',()=>({opsApi:mocks.api}));
let root,element;
beforeEach(()=>{vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);HTMLDialogElement.prototype.showModal=function(){this.open=true;};HTMLDialogElement.prototype.close=function(){this.open=false;};element=document.createElement('div');document.body.append(element);root=createRoot(element);mocks.api.mockReset();});
afterEach(async()=>{await act(async()=>root.unmount());element.remove();vi.unstubAllGlobals();});
const button=text=>[...element.querySelectorAll('button')].find(e=>e.textContent===text);
async function click(b){await act(async()=>b.click());}
it('requires a reason and explicit count confirmation; cancellation makes no reset request',async()=>{
 mocks.api.mockResolvedValue({previewId:'p',confirmationToken:'token',count:4,environment:'production',weeklyAllowance:500,trialAllowance:100});
 await act(async()=>root.render(createElement(ResetAllowances,{onComplete:vi.fn()})));
 expect(button('所有用户额度重置').disabled).toBe(true);
 await act(async()=>{const target=element.querySelector('input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(target,'补偿服务异常恢复基础额度');target.dispatchEvent(new Event('input',{bubbles:true}));});
 await click(button('所有用户额度重置'));expect(element.textContent).toContain('即将重置 4 个账户');expect(mocks.api.mock.calls.filter(([p])=>p.endsWith('/execute'))).toHaveLength(0);
 await click(button('取消'));expect(element.textContent).not.toContain('即将重置');expect(mocks.api.mock.calls.filter(([p])=>p.endsWith('/execute'))).toHaveLength(0);
 await click(button('所有用户额度重置'));await click(button('确认重置所有用户额度'));expect(mocks.api.mock.calls.filter(([p])=>p.endsWith('/execute'))).toHaveLength(1);
});
it('shows the full user table and opens the selected user order drawer',async()=>{
 const u={account_id:'test-account',phone:'13800000011',status:'active',created_at:'2026-01-01',membership_expires_at:null,member_active:false,latest_order:'order-123',available:95,total:100,remaining_percent:95,bonus_available:10};
 mocks.api.mockImplementation(async path=>path.includes('/detail')?{orders:[{id:'order-id',external_order_id:'order-123',channel:'apple',product_key:'31天会员',status:'active',purchased_at:'2026-01-01'}],usage:[],feedback:[]}:path.includes('/reports/accounts/')?{available:95,total:100,allowance:{membershipExpiresAt:null,resetAt:null},history:[]}:path.includes('/operations')?{rows:[],hasMore:false}:{rows:[u],total:1,page:1,limit:20,updatedAt:'2026-01-01'});
 await act(async()=>root.render(createElement(EntitlementsPage)));
 expect(element.textContent).toContain('13800000011');expect(element.textContent).toContain('order-123');expect(element.textContent).toContain('95.0%');
 await click(button('查看详情'));expect(element.querySelector('dialog[open]')).not.toBeNull();await click(button('购买订单'));expect(element.querySelector('dialog').textContent).toContain('order-id');
 await click(button('关闭'));expect(element.querySelector('dialog')).toBeNull();expect(mocks.api.mock.calls.some(([,o])=>o?.method==='POST')).toBe(false);
});
