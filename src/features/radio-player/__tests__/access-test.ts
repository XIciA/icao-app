import { nextTrack, previousTrack } from '../queue';
import { canPlayRadioTrack, visibleRadioCatalogs } from '../access';
import type { RadioTrack } from '../types';
let mockMembership = { active: false, expiresAt: null as string | null };
jest.mock('@/features/native-commercial-testflight/commerce-entitlement-events', () => ({
  getCommerceEntitlementSnapshot: () => ({snapshot:{membership:mockMembership}}),
}));
const free = { id: 'free', audioText: 'public', audioPath: '/free.mp3' } as RadioTrack;
const paid = { id: 'paid', requiresMembership: true, audioText: 'private', referenceText: 'answer', audioPath: '/paid.mp3' } as RadioTrack;
beforeEach(() => { mockMembership = { active: false, expiresAt: null }; });
it('permits free audio and skips member tracks in order, shuffle history and reverse', () => {
  const history = {history:['free','paid'],cursor:0};
  expect(canPlayRadioTrack(free)).toBe(true);
  expect(canPlayRadioTrack(paid)).toBe(false);
  expect(nextTrack([free,paid], 'free', 'order', history).trackId).toBe('free');
  expect(nextTrack([free,paid], 'free', 'shuffle', history).trackId).toBe('free');
  expect(previousTrack([free,paid], 'free', 'order', history).trackId).toBe('free');
  expect(nextTrack([paid], 'paid', 'repeatOne', history).trackId).toBeUndefined();
});
it('allows active members and closes access at the expiry deadline', () => {
  mockMembership = {active:true, expiresAt:new Date(Date.now()+60000).toISOString()};
  expect(canPlayRadioTrack(paid)).toBe(true);
  mockMembership.expiresAt = new Date(Date.now()-1).toISOString();
  expect(canPlayRadioTrack(paid)).toBe(false);
});
it('keeps locked entries visible while removing protected transcript and media on revocation', () => {
  const result = visibleRadioCatalogs([{bankId:'opi',title:'OPI',nameEn:'OPI',tracks:[free,paid]}]);
  expect(result[0].tracks).toHaveLength(2);
  expect(result[0].tracks[0]).toBe(free);
  expect(result[0].tracks[1]).toMatchObject({id:'paid',audioText:'',audioPath:'',referenceText:undefined});
});
