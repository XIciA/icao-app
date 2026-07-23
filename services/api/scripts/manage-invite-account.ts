import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import postgres from 'postgres';

import { createInviteCode, hashInviteCode, inviteCodeLookup, inviteEmail, invitePassword, parseInviteCode } from '../src/auth/invite-code';
import { loadConfig } from '../src/config';

const [action, value] = process.argv.slice(2);
if (!action || !value || !['create', 'disable', 'reset'].includes(action)) {
  throw new Error('usage: pnpm --filter @icao/api invite:manage <create|disable|reset> <四字名称或完整邀请码>');
}

const config = loadConfig();
const database = postgres(config.databaseUrl, { max: 1, prepare: false });
const admin = createClient(config.supabaseUrl, config.supabaseSecretKey, {
  auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
});

function parsedCode(input: string) {
  const parsed = parseInviteCode(input);
  if (!parsed) throw new Error('invalid_invite_code');
  return parsed;
}

async function revokeSessions(userId: string) {
  await database`
    insert into account_session_revocations (session_id, user_id, revoked_at)
    select id, user_id, now()
    from auth.sessions
    where user_id = ${userId}::uuid
    on conflict (session_id) do update set revoked_at = excluded.revoked_at
  `;
}

async function main() {
  try {
  if (action === 'create') {
    const inviteCode = createInviteCode(value);
    const parsed = parsedCode(inviteCode);
    const lookup = inviteCodeLookup(config.inviteAuthSecret, parsed.code);
    const duplicate = await database`select 1 from invite_accounts where code_lookup = ${lookup} limit 1`;
    if (duplicate.length) throw new Error('invite_code_exists');
    const { data, error } = await admin.auth.admin.createUser({
      email: inviteEmail(randomUUID()),
      password: invitePassword(config.inviteAuthSecret, parsed.code),
      email_confirm: true,
      user_metadata: { display_name: parsed.displayName, account_type: 'invite_beta' },
    });
    if (error || !data.user) throw error ?? new Error('invite_user_creation_failed');
    const email = inviteEmail(data.user.id);
    if (data.user.email !== email) {
      const update = await admin.auth.admin.updateUserById(data.user.id, { email });
      if (update.error) {
        await admin.auth.admin.deleteUser(data.user.id, false);
        throw update.error;
      }
    }
    try {
      await database`
        insert into invite_accounts (code_lookup, code_hash, display_name, user_id, status)
        values (${lookup}, ${hashInviteCode(parsed.code)}, ${parsed.displayName}, ${data.user.id}::uuid, 'active')
      `;
    } catch (error) {
      await admin.auth.admin.deleteUser(data.user.id, false);
      throw error;
    }
    console.log(inviteCode);
  } else {
    const current = parsedCode(value);
    const lookup = inviteCodeLookup(config.inviteAuthSecret, current.code);
    const [invite] = await database`
      select code_lookup, display_name, user_id, status
      from invite_accounts
      where code_lookup = ${lookup}
      limit 1
    `;
    if (!invite?.user_id || invite.status !== 'active') throw new Error('invite_not_active');

    if (action === 'disable') {
      await revokeSessions(invite.user_id);
      await database`update invite_accounts set status = 'disabled' where code_lookup = ${lookup}`;
      console.log('invite_disabled');
    } else {
      const nextCode = createInviteCode(invite.display_name);
      const next = parsedCode(nextCode);
      const update = await admin.auth.admin.updateUserById(invite.user_id, {
        password: invitePassword(config.inviteAuthSecret, next.code),
      });
      if (update.error) throw update.error;
      await revokeSessions(invite.user_id);
      await database`
        update invite_accounts
        set code_lookup = ${inviteCodeLookup(config.inviteAuthSecret, next.code)}, code_hash = ${hashInviteCode(next.code)}, last_login_at = null
        where code_lookup = ${lookup}
      `;
      console.log(nextCode);
    }
  }
  } finally {
    await database.end({ timeout: 5 });
  }
}

void main();
