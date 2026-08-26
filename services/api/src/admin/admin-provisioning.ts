import { lstat, open, readFile, realpath, stat, unlink } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { z } from 'zod';

import {
  createOpsRecoveryCodes,
  createOpsTotpSecret,
  encryptOpsTotpSecret,
  hashOpsPassword,
  hashOpsSecret,
} from './admin-crypto';

const provisionInputSchema = z.object({
  email: z.email().max(254).transform((value) => value.trim().toLowerCase()),
  password: z.string().min(14).max(256),
  role: z.enum(['admin', 'support']),
}).strict();

export type OpsProvisionInput = z.infer<typeof provisionInputSchema>;
export type OpsProvisionDelivery = {
  createdAt: string;
  email: string;
  instructions: string;
  otpauthUri: string;
  recoveryCodes: string[];
  role: 'admin' | 'support';
  staffId: string;
  totpSecret: string;
};

export function opsProvisionFailureCode(error: unknown) {
  if (error instanceof Error && error.message === 'ops_staff_email_exists') {
    return 'ops_staff_email_exists';
  }
  if (error && typeof error === 'object' && 'code' in error && error.code === '23505') {
    return 'ops_staff_email_exists';
  }
  return 'ops_staff_provision_failed';
}

function isWithin(root: string, candidate: string) {
  const path = relative(resolve(root), resolve(candidate));
  return path === '' || (!path.startsWith('..') && !isAbsolute(path));
}

function assertOutsideRepository(path: string, repositoryRoot: string) {
  if (isWithin(repositoryRoot, path)) throw new Error('ops_provision_file_must_be_outside_repository');
}

function assertOwnedByCurrentUser(uid: number) {
  if (typeof process.getuid === 'function' && uid !== process.getuid()) {
    throw new Error('ops_provision_file_owner_invalid');
  }
}

export function parseOpsProvisionInput(value: unknown): OpsProvisionInput {
  const parsed = provisionInputSchema.safeParse(value);
  if (!parsed.success) throw new Error('invalid_ops_provision_input');
  return parsed.data;
}

export async function readOpsProvisionInput(
  environment: NodeJS.ProcessEnv,
  repositoryRoot: string,
) {
  const inputFile = environment.OPS_PROVISION_INPUT_FILE;
  if (!inputFile) {
    return parseOpsProvisionInput({
      email: environment.OPS_PROVISION_EMAIL,
      password: environment.OPS_PROVISION_PASSWORD,
      role: environment.OPS_PROVISION_ROLE,
    });
  }
  if (!isAbsolute(inputFile)) throw new Error('ops_provision_input_path_must_be_absolute');
  const [realInputFile, realRepositoryRoot] = await Promise.all([
    realpath(inputFile),
    realpath(repositoryRoot),
  ]);
  assertOutsideRepository(realInputFile, realRepositoryRoot);
  const metadata = await lstat(inputFile);
  if (metadata.isSymbolicLink() || !metadata.isFile()) {
    throw new Error('ops_provision_input_file_invalid');
  }
  assertOwnedByCurrentUser(metadata.uid);
  if ((metadata.mode & 0o077) !== 0) throw new Error('ops_provision_input_file_not_private');
  let candidate: unknown;
  try {
    candidate = JSON.parse(await readFile(inputFile, 'utf8'));
  } catch {
    throw new Error('invalid_ops_provision_input');
  }
  return parseOpsProvisionInput(candidate);
}

export async function writeOpsProvisionDelivery(
  outputFile: string,
  repositoryRoot: string,
  delivery: OpsProvisionDelivery,
) {
  if (!isAbsolute(outputFile)) throw new Error('ops_provision_output_path_must_be_absolute');
  const [realDirectory, realRepositoryRoot] = await Promise.all([
    realpath(dirname(outputFile)),
    realpath(repositoryRoot),
  ]);
  assertOutsideRepository(join(realDirectory, basename(outputFile)), realRepositoryRoot);
  const directory = await stat(realDirectory);
  if (!directory.isDirectory()) throw new Error('ops_provision_output_directory_invalid');
  assertOwnedByCurrentUser(directory.uid);
  if ((directory.mode & 0o022) !== 0) {
    throw new Error('ops_provision_output_directory_not_private');
  }
  const file = await open(outputFile, 'wx', 0o600);
  try {
    await file.writeFile(`${JSON.stringify(delivery, null, 2)}\n`, { encoding: 'utf8' });
    await file.sync();
  } finally {
    await file.close();
  }
  const metadata = await lstat(outputFile);
  if (!metadata.isFile() || metadata.isSymbolicLink() || (metadata.mode & 0o077) !== 0) {
    throw new Error('ops_provision_output_file_not_private');
  }
}

function requiredEnvironment(environment: NodeJS.ProcessEnv, name: string, minimum = 1) {
  const value = environment[name];
  if (!value || value.length < minimum) {
    throw new Error(`invalid_ops_provision_configuration:${name}`);
  }
  return value;
}

export async function runOpsStaffProvision(
  environment: NodeJS.ProcessEnv = process.env,
  repositoryRoot = resolve(__dirname, '../../../..'),
) {
  const databaseUrl = requiredEnvironment(environment, 'DATABASE_URL');
  const sessionHashSecret = requiredEnvironment(environment, 'OPS_SESSION_HASH_SECRET', 32);
  const encryptionKey = requiredEnvironment(environment, 'OPS_TOTP_ENCRYPTION_KEY');
  const encryptionKeyBuffer = Buffer.from(encryptionKey, 'base64');
  if (encryptionKeyBuffer.byteLength !== 32 || encryptionKeyBuffer.toString('base64') !== encryptionKey) {
    throw new Error('invalid_ops_provision_configuration:OPS_TOTP_ENCRYPTION_KEY');
  }
  const outputFile = requiredEnvironment(environment, 'OPS_PROVISION_OUTPUT_FILE');
  const input = await readOpsProvisionInput(environment, repositoryRoot);
  const staffId = randomUUID();
  const createdAt = new Date();
  const totpSecret = createOpsTotpSecret();
  const recoveryCodes = createOpsRecoveryCodes();
  const passwordHash = await hashOpsPassword(input.password);
  const encryptedTotp = encryptOpsTotpSecret(totpSecret, encryptionKey);
  const recoveryRows = recoveryCodes.map((code) => ({
    id: randomUUID(),
    staff_id: staffId,
    code_hash: hashOpsSecret(code, sessionHashSecret, 'ops-recovery-code-v1'),
  }));
  const otpauthUri = `otpauth://totp/${encodeURIComponent(`飞猪 ICAO:${input.email}`)}`
    + `?secret=${encodeURIComponent(totpSecret)}&issuer=${encodeURIComponent('飞猪 ICAO')}`;
  const delivery: OpsProvisionDelivery = {
    staffId,
    email: input.email,
    role: input.role,
    createdAt: createdAt.toISOString(),
    totpSecret,
    otpauthUri,
    recoveryCodes,
    instructions: '导入 TOTP 后，将恢复码分别保存在公司密码管理器；确认可登录后安全删除此文件。',
  };

  await writeOpsProvisionDelivery(outputFile, repositoryRoot, delivery);
  const client = postgres(databaseUrl, { max: 1, prepare: false });
  try {
    await client.begin(async (transaction) => {
      const existing = await transaction<{ id: string }[]>`
        select id from ops_staff_accounts where email = ${input.email} limit 1
      `;
      if (existing.length > 0) throw new Error('ops_staff_email_exists');
      await transaction`
        insert into ops_staff_accounts (
          id, email, role, password_hash,
          totp_secret_ciphertext, totp_secret_iv, totp_secret_tag,
          totp_confirmed_at, password_changed_at, created_at, updated_at
        ) values (
          ${staffId}::uuid, ${input.email}, ${input.role}, ${passwordHash},
          ${encryptedTotp.ciphertext}, ${encryptedTotp.iv}, ${encryptedTotp.tag},
          ${createdAt}::timestamptz, ${createdAt}::timestamptz,
          ${createdAt}::timestamptz, ${createdAt}::timestamptz
        )
      `;
      await transaction`
        insert into ops_staff_recovery_codes
        ${transaction(recoveryRows, 'id', 'staff_id', 'code_hash')}
      `;
      await transaction`
        insert into ops_audit_events (
          request_id, action, target_type, target_id, reason, metadata, created_at
        ) values (
          ${`ops-provision:${staffId}`}, 'ops.staff.provision', 'ops_staff', ${staffId},
          '通过服务器一次性安全流程创建工作人员',
          ${transaction.json({ role: input.role })}::jsonb,
          ${createdAt}::timestamptz
        )
      `;
    });
  } catch (error) {
    await unlink(outputFile).catch(() => undefined);
    throw new Error(opsProvisionFailureCode(error));
  } finally {
    await client.end({ timeout: 5 });
  }
}
