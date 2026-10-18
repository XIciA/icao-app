import { ConflictException, ForbiddenException, HttpException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { chmod, lstat, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import {
  createOpsRecoveryCodes,
  decryptOpsTotpSecret,
  encryptOpsTotpSecret,
  hashOpsPassword,
  matchingOpsTotpStep,
  totpCodeAt,
  verifyOpsPassword,
  verifyOpsTotp,
} from '../src/admin/admin-crypto';
import { AdminAuthService } from '../src/admin/admin-auth.service';
import type { AdminAuditService } from '../src/admin/admin-audit.service';
import { AdminRoleGuard } from '../src/admin/admin-role.guard';
import { OpsLoginRateLimiter, opsLoginSource } from '../src/admin/admin-login-rate-limiter';
import { assertOpsStaffDisableAllowed } from '../src/admin/admin-staff.service';
import {
  opsProvisionFailureCode,
  parseOpsProvisionInput,
  readOpsProvisionInput,
  writeOpsProvisionDelivery,
  type OpsProvisionDelivery,
} from '../src/admin/admin-provisioning';
import { opsLoginSchema, opsGrantExecuteSchema, opsGrantPreviewSchema } from '../src/admin/admin.schemas';
import { loadConfig, loadOpsConfig, type OpsApiConfig } from '../src/config';
import { createOpsApp } from '../src/create-ops-app';
import { DatabaseService } from '../src/database/database.service';

describe('ops staff security primitives', () => {
  it('stores passwords as salted scrypt hashes and rejects another password', async () => {
    const encoded = await hashOpsPassword('correct horse battery staple');
    expect(encoded).toMatch(/^scrypt-v1\$16384\$8\$1\$/u);
    expect(encoded).not.toContain('correct horse battery staple');
    await expect(verifyOpsPassword('correct horse battery staple', encoded)).resolves.toBe(true);
    await expect(verifyOpsPassword('wrong horse battery staple', encoded)).resolves.toBe(false);
  });

  it('matches the RFC 6238 SHA-1 vector and exposes a monotonic step for replay prevention', () => {
    const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
    const at = new Date(59_000);
    expect(totpCodeAt(secret, at)).toBe('287082');
    expect(verifyOpsTotp(secret, '287082', at)).toBe(true);
    expect(matchingOpsTotpStep(secret, '287082', at)).toBe(1);
    expect(verifyOpsTotp(secret, '287083', at)).toBe(false);
  });

  it('encrypts TOTP material with authenticated encryption', () => {
    const key = Buffer.alloc(32, 7).toString('base64');
    const encrypted = encryptOpsTotpSecret('JBSWY3DPEHPK3PXP', key);
    expect(encrypted.ciphertext).not.toContain('JBSWY3DPEHPK3PXP');
    expect(decryptOpsTotpSecret(encrypted, key)).toBe('JBSWY3DPEHPK3PXP');
    expect(() => decryptOpsTotpSecret(encrypted, Buffer.alloc(32, 8).toString('base64'))).toThrow();
  });

  it('creates non-repeating one-time recovery codes', () => {
    const codes = createOpsRecoveryCodes();
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    expect(codes.every((code) => /^[A-F0-9]{4}(?:-[A-F0-9]{4}){3}$/u.test(code))).toBe(true);
  });
});

describe('ops high-risk request gates', () => {
  it('keeps ops tables server-only and audit/adjustment rows append-only in migration SQL', async () => {
    const migration = await readFile(resolve(process.cwd(), 'drizzle/0029_curvy_talon.sql'), 'utf8');
    const reconciliationMigration = await readFile(
      resolve(process.cwd(), 'drizzle/0033_medical_preak.sql'),
      'utf8',
    );
    expect(migration).toContain('ops_audit_events_append_only');
    expect(migration).toContain('ops_entitlement_adjustments_append_only');
    expect(migration).toContain('REVOKE ALL ON TABLE "ops_staff_accounts" FROM anon, authenticated;');
    expect(migration).toContain('REVOKE ALL ON TABLE "ops_audit_events" FROM anon, authenticated;');
    expect(migration).toContain('membership_segments_source_check');
    expect(migration).not.toContain('failed_login_count');
    expect(migration).not.toContain('locked_until');
    expect(reconciliationMigration).toContain(
      'CREATE UNIQUE INDEX "ops_audit_events_apple_reconciliation_completed"',
    );
    expect(reconciliationMigration).toContain(
      'WHERE "ops_audit_events"."action" = \'apple_server_reconciliation.batch_completed\'',
    );
  });

  it('requires a meaningful reason and a non-zero grant', () => {
    const base = {
      accountId: '00000000-0000-4000-8000-000000000001',
      environment: 'sandbox' as const,
      membershipDays: 0,
      aiPoints: 0,
      reason: '审核账号权益补偿',
    };
    expect(opsGrantPreviewSchema.safeParse(base).success).toBe(false);
    expect(opsGrantPreviewSchema.safeParse({ ...base, aiPoints: 100 }).success).toBe(true);
    expect(opsGrantPreviewSchema.safeParse({ ...base, aiMode: 'refill', aiPoints: 1_000_000 }).success).toBe(true);
    expect(opsGrantPreviewSchema.safeParse({ ...base, aiMode: 'gift', aiPoints: 100_001 }).success).toBe(false);
    expect(opsGrantPreviewSchema.safeParse({ ...base, aiMode: 'refill', aiPoints: 1_000_001 }).success).toBe(false);
    expect(opsGrantPreviewSchema.safeParse({ ...base, aiPoints: 100, reason: '太短' }).success).toBe(false);
    expect(opsGrantPreviewSchema.safeParse({ ...base, aiPoints: 100, reason: '赠会员' }).success).toBe(true);
    expect(opsGrantPreviewSchema.safeParse({ ...base, aiPoints: 100, reason: ' 太短 ' }).success).toBe(false);
  });

  it('accepts only the exact explicit execution phrase', () => {
    const confirmationToken = 'a'.repeat(43);
    expect(opsGrantExecuteSchema.safeParse({ confirmation: '确认发放', confirmationToken }).success).toBe(true);
    expect(opsGrantExecuteSchema.safeParse({ confirmation: '确定', confirmationToken }).success).toBe(false);
  });

  it('blocks support staff from admin-only routes', () => {
    const reflector = { getAllAndOverride: () => ['admin'] } as unknown as Reflector;
    const guard = new AdminRoleGuard(reflector);
    const context = {
      getHandler: () => function handler() {},
      getClass: () => class Controller {},
      switchToHttp: () => ({
        getRequest: () => ({ opsStaff: { role: 'support' } }),
      }),
    } as unknown as ExecutionContext;
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('blocks self-disable and disabling the final active administrator', () => {
    expect(() => assertOpsStaffDisableAllowed({
      activeAdminCount: 2,
      actorStaffId: 'staff-1',
      targetRole: 'support',
      targetStaffId: 'staff-1',
    })).toThrow(ConflictException);
    expect(() => assertOpsStaffDisableAllowed({
      activeAdminCount: 1,
      actorStaffId: 'staff-1',
      targetRole: 'admin',
      targetStaffId: 'staff-2',
    })).toThrow('ops_staff_last_admin_required');
    expect(() => assertOpsStaffDisableAllowed({
      activeAdminCount: 2,
      actorStaffId: 'staff-1',
      targetRole: 'admin',
      targetStaffId: 'staff-2',
    })).not.toThrow();
  });
});

describe('ops login anti-abuse boundary', () => {
  const secret = 'test-ops-rate-limit-secret-that-is-long-enough';
  const authConfig = {
    databaseUrl: 'postgresql://postgres:test@127.0.0.1:5432/postgres',
    nodeEnv: 'test',
    apiReleaseId: 'ops-test',
    accountIdentityHashSecret: 'test-account-identity-secret-that-is-long-enough',
    opsEnabled: true,
    opsHost: '127.0.0.1',
    opsPort: 3102,
    opsCorsOrigins: ['http://127.0.0.1:4180'],
    opsSessionHashSecret: secret,
    opsTotpEncryptionKey: Buffer.alloc(32, 7).toString('base64'),
    opsTrustedProxySharedSecret: 'test-ops-proxy-secret-that-is-long-enough',
  } satisfies OpsApiConfig;

  it('loads a production Ops config without ordinary API secrets', () => {
    const config = loadOpsConfig({
      DATABASE_URL: authConfig.databaseUrl,
      NODE_ENV: 'production',
      API_RELEASE_ID: 'ops-production-test',
      ACCOUNT_IDENTITY_HASH_SECRET: authConfig.accountIdentityHashSecret,
      OPS_ENABLED: '1',
      OPS_HOST: '127.0.0.1',
      OPS_PORT: '3102',
      OPS_CORS_ORIGINS: 'https://api.readyoufife.com',
      OPS_SESSION_HASH_SECRET: authConfig.opsSessionHashSecret,
      OPS_TOTP_ENCRYPTION_KEY: authConfig.opsTotpEncryptionKey,
      OPS_TRUSTED_PROXY_SHARED_SECRET: authConfig.opsTrustedProxySharedSecret,
      SUPABASE_SECRET_KEY: 'ignored-and-never-returned',
      APPLE_PRIVATE_KEY: 'ignored-and-never-returned',
      DEEPSEEK_API_KEY: 'ignored-and-never-returned',
    });
    expect(config).toEqual({
      ...authConfig,
      nodeEnv: 'production',
      apiReleaseId: 'ops-production-test',
      opsCorsOrigins: ['https://api.readyoufife.com'],
    });
    expect('supabaseSecretKey' in config).toBe(false);
    expect('applePrivateKey' in config).toBe(false);
    expect('deepseekApiKey' in config).toBe(false);
  });

  it('fails closed for a non-release identity or another production browser origin', () => {
    const productionEnvironment = {
      DATABASE_URL: authConfig.databaseUrl,
      NODE_ENV: 'production',
      API_RELEASE_ID: 'ops-production-test',
      ACCOUNT_IDENTITY_HASH_SECRET: authConfig.accountIdentityHashSecret,
      OPS_ENABLED: '1',
      OPS_HOST: '0.0.0.0',
      OPS_PORT: '3102',
      OPS_CORS_ORIGINS: 'https://api.readyoufife.com',
      OPS_SESSION_HASH_SECRET: authConfig.opsSessionHashSecret,
      OPS_TOTP_ENCRYPTION_KEY: authConfig.opsTotpEncryptionKey,
      OPS_TRUSTED_PROXY_SHARED_SECRET: authConfig.opsTrustedProxySharedSecret,
    };
    expect(() => loadOpsConfig({ ...productionEnvironment, API_RELEASE_ID: 'development' }))
      .toThrow('invalid_ops_api_configuration:API_RELEASE_ID');
    expect(() => loadOpsConfig({
      ...productionEnvironment,
      OPS_CORS_ORIGINS: 'https://api.readyoufife.com,https://example.com',
    })).toThrow('invalid_ops_api_configuration:OPS_CORS_ORIGINS');
  });

  it('keeps ordinary configuration independent from all Ops variables', () => {
    const config = loadConfig({
      DATABASE_URL: authConfig.databaseUrl,
      NODE_ENV: 'development',
      SUPABASE_URL: 'http://127.0.0.1:8000',
      SUPABASE_PUBLIC_URL: 'http://127.0.0.1:8000',
      SUPABASE_PUBLISHABLE_KEY: 'test-publishable-key-that-is-long-enough',
      SUPABASE_SECRET_KEY: 'test-secret-key-that-is-long-enough',
      INVITE_AUTH_SECRET: 'test-invite-auth-secret-that-is-long-enough',
      ACCOUNT_IDENTITY_HASH_SECRET: authConfig.accountIdentityHashSecret,
      OPS_ENABLED: 'invalid-and-ignored',
      OPS_TOTP_ENCRYPTION_KEY: 'invalid-and-ignored',
    });
    expect('opsEnabled' in config).toBe(false);
    expect('opsTotpEncryptionKey' in config).toBe(false);
  });

  it('bootstraps the real isolated Nest application without ordinary API providers', async () => {
    // Schema-version enforcement has its own real-Postgres suite. This test
    // keeps the Ops module-isolation assertion independent of a developer's
    // local migration state while retaining the real DatabaseService wiring.
    const schemaGate = vi.spyOn(DatabaseService.prototype, 'assertMinimumSchemaVersion')
      .mockResolvedValueOnce(undefined);
    let app: Awaited<ReturnType<typeof createOpsApp>> | undefined;
    try {
      app = await createOpsApp(authConfig);
      const response = await app.inject({ method: 'GET', url: '/health/live' });
      expect(response.statusCode).toBe(200);
      expect(response.headers['x-icao-api-version']).toBe('ops-test');
      expect(response.json().data.service).toBe('icao-ops-api');
      const payload = { revision: 1, draft: { notes: 'x'.repeat(2_600_000) } };
      const draftResponse = await app.inject({ method: 'POST',
        url: '/v1/admin/content-orders/00000000-0000-4000-8000-000000000001/prepare', payload });
      // Parsing a real-sized draft reaches authentication rather than failing at 1 MiB.
      expect(draftResponse.statusCode).toBe(401);
      const ordinaryResponse = await app.inject({ method: 'POST', url: '/v1/admin/content-orders', payload });
      expect(ordinaryResponse.statusCode).toBe(401);
      const unrelatedResponse = await app.inject({method:'POST',url:'/v1/admin/auth/login',payload});
      expect(unrelatedResponse.statusCode).toBe(413);
    } finally {
      await app?.close();
      schemaGate.mockRestore();
    }
  });

  it('does not trust generic or unauthenticated forwarding headers', () => {
    expect(opsLoginSource({
      id: 'request-1',
      headers: { 'x-forwarded-for': '198.51.100.10', 'x-ops-client-ip': '203.0.113.9' },
      raw: { socket: { remoteAddress: '127.0.0.1' } },
    }, secret)).toBe('127.0.0.1');
    expect(opsLoginSource({
      id: 'request-2',
      headers: {
        'x-forwarded-for': '198.51.100.10',
        'x-ops-client-ip': '203.0.113.9',
        'x-ops-proxy-secret': secret,
      },
      raw: { socket: { remoteAddress: '127.0.0.1' } },
    }, secret)).toBe('203.0.113.9');
    expect(opsLoginSource({
      id: 'request-3',
      headers: { 'x-ops-client-ip': '203.0.113.9', 'x-ops-proxy-secret': secret },
      raw: { socket: { remoteAddress: '192.0.2.7' } },
    }, secret)).toBe('192.0.2.7');
  });

  it('bounds source work before reset and returns the same credential code', () => {
    const limiter = new OpsLoginRateLimiter(authConfig);
    const at = Date.UTC(2026, 7, 25);
    for (let attempt = 0; attempt < 8; attempt += 1) {
      expect(() => limiter.assertAllowed('203.0.113.9', at)).not.toThrow();
    }
    try {
      limiter.assertAllowed('203.0.113.9', at);
      throw new Error('expected_rate_limit');
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(429);
      expect((error as HttpException).message).toBe('invalid_ops_credentials');
    }
    expect(limiter.sizeForTesting()).toBe(1);
    expect(() => limiter.assertAllowed('203.0.113.9', at + 10 * 60 * 1_000)).not.toThrow();
  });

  it('bounds total work and source-state memory under distributed input', () => {
    const limiter = new OpsLoginRateLimiter(authConfig);
    const at = Date.UTC(2026, 7, 25);
    for (let source = 0; source < 200; source += 1) {
      expect(() => limiter.assertAllowed(`198.51.100.${source}`, at)).not.toThrow();
    }
    expect(() => limiter.assertAllowed('203.0.113.200', at)).toThrow(HttpException);
    expect(limiter.sizeForTesting()).toBe(200);
  });

  it('accepts password-only login without MFA enrollment and records its actual method', async () => {
    const password = 'correct horse battery staple';
    const input = opsLoginSchema.parse({ email: 'admin@example.com', password });
    const staff = { id: 'staff-1', email: input.email, role: 'admin', disabledAt: null,
      passwordHash: await hashOpsPassword(password), totpConfirmedAt: null };
    const values = vi.fn(() => ({ returning: vi.fn().mockResolvedValue([{ id: 'session-1' }]) }));
    const transaction = { execute: vi.fn(), insert: vi.fn(() => ({ values })) };
    const db = { select: vi.fn(() => ({ from: () => ({ where: () => ({ limit: async () => [staff] }) }) })),
      transaction: vi.fn(async (fn) => fn(transaction)) };
    const audit = { record: vi.fn() };
    const auth = new AdminAuthService(authConfig, { db } as unknown as DatabaseService,
      audit as unknown as AdminAuditService, new OpsLoginRateLimiter(authConfig));
    const session = await auth.login(input, 'password-login', '198.51.100.80');
    expect(session.staff.email).toBe(input.email);
    expect(session.accessToken.length).toBeGreaterThan(32);
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({
      action: 'ops.auth.login', metadata: { authenticationMethod: 'password' },
    }), transaction);
    await expect(auth.login({ ...input, password: 'wrong password value' }, 'wrong-password', '198.51.100.81'))
      .rejects.toMatchObject({ status: 401 });
    staff.disabledAt = new Date() as never;
    await expect(auth.login(input, 'disabled-staff', '198.51.100.82'))
      .rejects.toMatchObject({ status: 401 });
    expect(db.transaction).toHaveBeenCalledOnce();
  });

  it('does no database, scrypt, or audit work after the source gate rejects', async () => {
    const limiter = new OpsLoginRateLimiter(authConfig);
    const at = Date.now();
    for (let attempt = 0; attempt < 8; attempt += 1) limiter.assertAllowed('203.0.113.7', at);
    const database = { db: { select: vi.fn() } } as unknown as DatabaseService;
    const audit = { record: vi.fn() } as unknown as AdminAuditService;
    const auth = new AdminAuthService(authConfig, database, audit, limiter);
    await expect(auth.login({
      email: 'unknown@example.com',
      password: 'not-a-real-password',
      totpCode: '000000',
    }, 'request-rate-limited', '203.0.113.7')).rejects.toMatchObject({ status: 429 });
    expect(database.db.select).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('does not append login-failure audit for an unknown email', async () => {
    const limit = vi.fn().mockResolvedValue([]);
    const where = vi.fn(() => ({ limit }));
    const from = vi.fn(() => ({ where }));
    const database = { db: { select: vi.fn(() => ({ from })) } } as unknown as DatabaseService;
    const audit = { record: vi.fn() } as unknown as AdminAuditService;
    const limiter = new OpsLoginRateLimiter(authConfig);
    const auth = new AdminAuthService(authConfig, database, audit, limiter);
    await expect(auth.login({
      email: 'unknown@example.com',
      password: 'not-a-real-password',
      totpCode: '000000',
    }, 'request-unknown', '198.51.100.40')).rejects.toMatchObject({ status: 401 });
    expect(database.db.select).toHaveBeenCalledOnce();
    expect(audit.record).not.toHaveBeenCalled();
  });
});

describe('ops staff one-time provisioning files', () => {
  const delivery: OpsProvisionDelivery = {
    staffId: '00000000-0000-4000-8000-000000000011',
    email: 'owner@example.com',
    role: 'admin',
    createdAt: '2026-08-25T00:00:00.000Z',
    totpSecret: 'JBSWY3DPEHPK3PXP',
    otpauthUri: 'otpauth://totp/example',
    recoveryCodes: ['AAAA-BBBB-CCCC-DDDD'],
    instructions: 'store securely',
  };

  it('validates only admin/support inputs with a strong password', () => {
    expect(parseOpsProvisionInput({
      email: 'OWNER@EXAMPLE.COM',
      password: 'a secure password of sufficient length',
      role: 'admin',
    })).toMatchObject({ email: 'owner@example.com', role: 'admin' });
    expect(() => parseOpsProvisionInput({
      email: 'owner@example.com', password: 'short', role: 'admin',
    })).toThrow('invalid_ops_provision_input');
    expect(() => parseOpsProvisionInput({
      email: 'owner@example.com', password: 'a secure password of sufficient length', role: 'owner',
    })).toThrow('invalid_ops_provision_input');
  });

  it('accepts a private input file and rejects a group-readable one', async () => {
    const sandbox = await mkdtemp(join(tmpdir(), 'icao-ops-provision-'));
    const repositoryRoot = join(sandbox, 'repo');
    const inputFile = join(sandbox, 'input.json');
    try {
      await mkdir(repositoryRoot, { mode: 0o700 });
      await writeFile(inputFile, JSON.stringify({
        email: 'support@example.com',
        password: 'a secure password of sufficient length',
        role: 'support',
      }), { mode: 0o600 });
      await expect(readOpsProvisionInput({ OPS_PROVISION_INPUT_FILE: inputFile }, repositoryRoot))
        .resolves.toMatchObject({ email: 'support@example.com', role: 'support' });
      await chmod(inputFile, 0o640);
      await expect(readOpsProvisionInput({ OPS_PROVISION_INPUT_FILE: inputFile }, repositoryRoot))
        .rejects.toThrow('ops_provision_input_file_not_private');
    } finally {
      await rm(sandbox, { recursive: true, force: true });
    }
  });

  it('writes delivery material once with mode 0600 outside the repository', async () => {
    const sandbox = await mkdtemp(join(tmpdir(), 'icao-ops-delivery-'));
    const repositoryRoot = join(sandbox, 'repo');
    const outputFile = join(sandbox, 'delivery.json');
    try {
      await mkdir(repositoryRoot, { mode: 0o700 });
      await writeOpsProvisionDelivery(outputFile, repositoryRoot, delivery);
      expect((await lstat(outputFile)).mode & 0o777).toBe(0o600);
      expect(JSON.parse(await readFile(outputFile, 'utf8'))).toEqual(delivery);
      await expect(writeOpsProvisionDelivery(outputFile, repositoryRoot, delivery)).rejects.toThrow();
      await expect(writeOpsProvisionDelivery(
        join(repositoryRoot, 'delivery.json'),
        repositoryRoot,
        delivery,
      )).rejects.toThrow('ops_provision_file_must_be_outside_repository');
    } finally {
      await rm(sandbox, { recursive: true, force: true });
    }
  });

  it('maps database uniqueness failures to duplicate-email refusal', () => {
    expect(opsProvisionFailureCode({ code: '23505' })).toBe('ops_staff_email_exists');
    expect(opsProvisionFailureCode(new Error('ops_staff_email_exists'))).toBe('ops_staff_email_exists');
    expect(opsProvisionFailureCode(new Error('network'))).toBe('ops_staff_provision_failed');
  });
});
