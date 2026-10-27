import { accountEntryLabel, publicAccountStatus } from '../public-account-status';
const guest = { canAccessApp: false, restoring: false, accountRestoreUnavailable: false, accountDeletionPending: false, accountReady: false };
it('only declares guest after a completed, successful session lookup with no session', () => {
  expect(publicAccountStatus(guest)).toBe('guest');
  expect(publicAccountStatus({ ...guest, restoring: true })).toBe('restoring');
  expect(publicAccountStatus({ ...guest, accountRestoreUnavailable: true })).toBe('unavailable');
  expect(publicAccountStatus({ ...guest, session: {} })).toBe('restoring');
  expect(publicAccountStatus({ ...guest, session: {}, accountReady: true })).toBe('confirmation-required');
  expect(publicAccountStatus({ ...guest, accountDeletionPending: true })).toBe('deleting');
  expect(publicAccountStatus({ ...guest, canAccessApp: true })).toBe('authenticated');
});
it('keeps retry and consent wording distinct from login', () => {
  expect(accountEntryLabel('guest')).toBe('登录 / 注册');
  expect(accountEntryLabel('unavailable')).toBe('重新检查账号');
  expect(accountEntryLabel('confirmation-required')).toBe('完成账号确认');
});
