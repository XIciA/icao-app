type AccountSnapshot = {
  canAccessApp: boolean;
  restoring: boolean;
  accountRestoreUnavailable: boolean;
  accountDeletionPending: boolean;
  accountReady: boolean;
  session?: unknown;
};

/** Lack of business access is not proof that the persistent session is absent. */
export function publicAccountStatus(auth: AccountSnapshot) {
  if (auth.accountDeletionPending) return 'deleting';
  if (auth.canAccessApp) return 'authenticated';
  if (auth.restoring) return 'restoring';
  if (auth.accountRestoreUnavailable) return 'unavailable';
  if (auth.session) return auth.accountReady ? 'confirmation-required' : 'restoring';
  return 'guest';
}

export type PublicAccountStatus = ReturnType<typeof publicAccountStatus>;

export function accountEntryLabel(status: PublicAccountStatus) {
  switch (status) {
    case 'authenticated': return '打开个人资料';
    case 'restoring': return '正在恢复登录…';
    case 'unavailable': return '重新检查账号';
    case 'confirmation-required': return '完成账号确认';
    case 'deleting': return '查看注销状态';
    case 'guest': return '登录 / 注册';
  }
}
