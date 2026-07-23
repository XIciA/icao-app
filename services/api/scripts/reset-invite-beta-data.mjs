import postgres from 'postgres';

const apply = process.argv.includes('--apply');
const expectedUsers = Number(process.env.INVITE_BETA_RESET_EXPECTED_USERS);
if (!Number.isInteger(expectedUsers) || expectedUsers < 0) throw new Error('missing_or_invalid_INVITE_BETA_RESET_EXPECTED_USERS');
if (apply && process.env.INVITE_BETA_RESET_CONFIRM !== 'DELETE_ALL_TEST_ACCOUNTS') {
  throw new Error('missing_INVITE_BETA_RESET_CONFIRM');
}
if (!process.env.DATABASE_URL) throw new Error('missing_DATABASE_URL');

const database = postgres(process.env.DATABASE_URL, { max: 1, prepare: false });
try {
  const [users] = await database`select count(*)::int as count from auth.users`;
  const [inviteCount] = await database`select count(*)::int as count from invite_accounts`;
  if (users.count !== expectedUsers) throw new Error(`invite_beta_reset_user_count_mismatch:${users.count}`);

  const manifest = { authUsers: users.count, inviteAccounts: inviteCount.count };
  if (!apply) {
    console.log(JSON.stringify({ mode: 'dry-run', ...manifest }));
  } else {
    await database.begin(async (tx) => {
      await tx`delete from invite_login_attempts`;
      await tx`delete from invite_accounts`;
      await tx`delete from auth.users`;
    });
    console.log(JSON.stringify({ mode: 'applied', ...manifest }));
  }
} finally {
  await database.end({ timeout: 5 });
}
