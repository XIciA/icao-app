import { membershipReminder } from '../membership-reminder';
const now=Date.parse('2026-10-17T00:00:00Z');
it('uses the actual expiry and only reminds within three days or after expiry',()=>{
 expect(membershipReminder(null,now)).toBeUndefined();expect(membershipReminder('invalid',now)).toBeUndefined();expect(membershipReminder('2026-10-20T00:00:01Z',now)).toBeUndefined();expect(membershipReminder('2026-10-20T00:00:00Z',now)?.phase).toBe('expiring');expect(membershipReminder('2026-10-17T00:00:00Z',now)?.phase).toBe('expired');expect(membershipReminder('2026-11-17T00:00:00Z',now)).toBeUndefined();
});
