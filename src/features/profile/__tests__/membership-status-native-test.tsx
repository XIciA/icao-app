import type { CommerceEntitlementSummary } from '@icao/contracts';
import { membershipPresentation } from '../MembershipStatus.native';
jest.mock('@/features/native-commercial-testflight/CommerceRuntimeProvider', () => ({ useCommerceRuntime: jest.fn() }));
function snapshot(active:boolean, expiresAt:string|null) {return {serverTime:'2026-10-22T00:00:00Z',membership:{active,expiresAt}} as CommerceEntitlementSummary;}
it('uses one VIP identity with separate status copy for all membership states', () => {
  expect(membershipPresentation(snapshot(false,null)).label).toBe('未开通会员');
  expect(membershipPresentation(snapshot(true,'2026-11-14T00:00:00Z')).label).toBe('剩余 23 天');
  expect(membershipPresentation(snapshot(true,'2026-10-24T00:00:00Z')).label).toBe('剩余 2 天');
  expect(membershipPresentation(snapshot(false,'2026-10-21T00:00:00Z')).label).toBe('会员已过期');
  expect(membershipPresentation().label).toBe('正在确认会员…');
});
