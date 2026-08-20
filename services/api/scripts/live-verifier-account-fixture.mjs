function cleanupError(code, cause) {
  return new Error(code, { cause });
}

function userAlreadyAbsent(error) {
  if (!error || typeof error !== 'object') return false;
  const detail = `${'code' in error ? String(error.code) : ''} ${'message' in error ? String(error.message) : ''}`;
  return /user[_ ]?not[_ ]?found|not found/iu.test(detail);
}

async function deleteAuthUser(admin, authUserId) {
  const deletion = await admin.auth.admin.deleteUser(authUserId);
  if (deletion.error && !userAlreadyAbsent(deletion.error)) throw deletion.error;
}

export async function cleanupTemporaryBusinessAccount({
  accountId,
  admin,
  authUserId,
  database,
  errorPrefix,
}) {
  const errors = [];
  let accountDeleteFailed = false;
  let authDeleteFailed = false;

  if (accountId) {
    try {
      await database`delete from accounts where id = ${accountId}`;
    } catch {
      accountDeleteFailed = true;
    }
  }

  if (authUserId) {
    try {
      await deleteAuthUser(admin, authUserId);
    } catch {
      authDeleteFailed = true;
    }
  }

  // Deleting the auth user can release an auth FK that blocked business cleanup,
  // while a transient auth-admin failure can succeed on a single bounded retry.
  if (accountId && accountDeleteFailed) {
    try {
      await database`delete from accounts where id = ${accountId}`;
      accountDeleteFailed = false;
    } catch (error) {
      errors.push(cleanupError(`${errorPrefix}_cleanup_account_failed`, error));
    }
  }
  if (authUserId && authDeleteFailed) {
    try {
      await deleteAuthUser(admin, authUserId);
      authDeleteFailed = false;
    } catch (error) {
      errors.push(cleanupError(`${errorPrefix}_cleanup_auth_user_failed`, error));
    }
  }

  if (!accountId && !authUserId) return errors;

  try {
    const [remnants] = await database`
      select
        ${accountId ? database`exists(select 1 from accounts where id = ${accountId})` : false} as account_exists,
        ${authUserId ? database`exists(select 1 from auth.users where id = ${authUserId})` : false} as auth_user_exists,
        ${accountId && authUserId
          ? database`exists(select 1 from account_identities where account_id = ${accountId} or auth_user_id = ${authUserId})`
          : false} as identity_exists,
        ${accountId ? database`exists(select 1 from profiles where user_id = ${accountId})` : false} as profile_exists,
        ${accountId ? database`exists(select 1 from ai_consents where user_id = ${accountId})` : false} as consent_exists,
        ${accountId ? database`exists(select 1 from ai_usage_logs where user_id = ${accountId})` : false} as usage_exists,
        ${accountId ? database`exists(select 1 from ai_quota_buckets where user_id = ${accountId})` : false} as quota_exists,
        ${accountId ? database`exists(select 1 from ai_word_cache where user_id = ${accountId})` : false} as word_cache_exists,
        ${authUserId
          ? database`exists(select 1 from account_session_revocations where user_id = ${authUserId})`
          : false} as revocation_exists
    `;
    if (!remnants || Object.values(remnants).some(Boolean)) {
      errors.push(cleanupError(`${errorPrefix}_cleanup_postcondition_failed`, remnants));
    }
  } catch (error) {
    errors.push(cleanupError(`${errorPrefix}_cleanup_postcondition_check_failed`, error));
  }

  return errors;
}
