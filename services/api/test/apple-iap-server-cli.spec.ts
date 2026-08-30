import { SendAttemptResult } from '@apple/app-store-server-library';
import { describe, expect, it, vi } from 'vitest';

import { runAppleIapServerCli } from '../src/apple-iap-server-cli';
import { AppleServerReconciliationApplyError } from '../src/commerce/apple-server-reconciliation.service';

function dependencies() {
  return {
    getTestNotificationStatus: vi.fn(async (environment) => ({
      environment,
      sendAttempts: [{
        attemptDate: '2026-08-26T01:02:03.000Z',
        sendAttemptResult: SendAttemptResult.SUCCESS,
      }],
    })),
    isRoot: vi.fn(() => true),
    reconcile: vi.fn(async (): Promise<unknown> => ({ checked: 1 })),
    requestTestNotification: vi.fn(async (environment) => ({ environment, testNotificationToken: 'token' })),
    write: vi.fn(),
  };
}

describe('root-only Apple IAP Server readiness CLI', () => {
  it('rejects non-root execution before any Apple or database action', async () => {
    const deps = dependencies();
    deps.isRoot.mockReturnValue(false);
    await expect(runAppleIapServerCli([
      'test-notification', '--environment', 'sandbox',
    ], deps)).rejects.toThrow('apple_iap_server_cli_requires_root');
    expect(deps.requestTestNotification).not.toHaveBeenCalled();
    expect(deps.getTestNotificationStatus).not.toHaveBeenCalled();
    expect(deps.reconcile).not.toHaveBeenCalled();
  });

  it('requires root before checking a test notification status', async () => {
    const deps = dependencies();
    deps.isRoot.mockReturnValue(false);
    await expect(runAppleIapServerCli([
      'test-notification-status',
      '--environment', 'sandbox',
      '--test-notification-token', '8cd2974c-f905-492a-bf9a-b2f47c791d19',
    ], deps)).rejects.toThrow('apple_iap_server_cli_requires_root');
    expect(deps.getTestNotificationStatus).not.toHaveBeenCalled();
  });

  it('defaults test notification to an offline dry-run', async () => {
    const deps = dependencies();
    await expect(runAppleIapServerCli([
      'test-notification', '--environment', 'sandbox',
    ], deps)).resolves.toMatchObject({
      dryRun: true,
      environment: 'sandbox',
      networkAttempted: false,
      requiredConfirmation: 'REQUEST_APPLE_TEST_NOTIFICATION_SANDBOX',
    });
    expect(deps.requestTestNotification).not.toHaveBeenCalled();
  });

  it('requires an environment-specific confirmation before requesting a test notification', async () => {
    const deps = dependencies();
    await expect(runAppleIapServerCli([
      'test-notification', '--environment', 'production', '--execute',
      '--confirm', 'REQUEST_APPLE_TEST_NOTIFICATION_SANDBOX',
    ], deps)).rejects.toThrow('apple_iap_server_cli_confirmation_invalid');
    expect(deps.requestTestNotification).not.toHaveBeenCalled();

    await runAppleIapServerCli([
      'test-notification', '--environment', 'production', '--execute',
      '--confirm', 'REQUEST_APPLE_TEST_NOTIFICATION_PRODUCTION',
    ], deps);
    expect(deps.requestTestNotification).toHaveBeenCalledWith('production');
  });

  it.each([
    '8cd2974c-f905-492a-bf9a-b2f47c791d19',
    '8cd2974c-f905-492a-bf9a-b2f47c791d19_1788055084255',
  ])('checks status with an opaque Apple token and prints only the redacted summary', async (token) => {
    const deps = dependencies();
    const result = await runAppleIapServerCli([
      'test-notification-status',
      '--environment', 'production',
      '--test-notification-token', token,
    ], deps);

    expect(deps.getTestNotificationStatus).toHaveBeenCalledWith('production', token);
    expect(result).toEqual({
      environment: 'production',
      sendAttempts: [{
        attemptDate: '2026-08-26T01:02:03.000Z',
        sendAttemptResult: SendAttemptResult.SUCCESS,
      }],
    });
    const output = JSON.stringify(deps.write.mock.calls);
    expect(output).not.toContain(token);
    expect(output).not.toContain('signedPayload');
    expect(output).not.toContain('testNotificationToken');
  });

  it.each([
    [
      ['test-notification-status', '--environment', 'staging', '--test-notification-token',
        '8cd2974c-f905-492a-bf9a-b2f47c791d19'],
      'apple_iap_server_cli_environment_invalid',
    ],
    [
      ['test-notification-status', '--environment', 'sandbox', '--test-notification-token', '../token'],
      'apple_iap_server_cli_test_notification_token_invalid',
    ],
    [
      ['test-notification-status', '--environment', 'sandbox'],
      'apple_iap_server_cli_test_notification_token_required',
    ],
    [
      ['test-notification-status', '--environment', 'sandbox', '--test-notification-token',
        '8cd2974c-f905-492a-bf9a-b2f47c791d19', '--execute'],
      'apple_iap_server_cli_argument_invalid',
    ],
  ])('rejects invalid status arguments before the Apple call', async (argv, code) => {
    const deps = dependencies();
    await expect(runAppleIapServerCli(argv, deps)).rejects.toThrow(code);
    expect(deps.getTestNotificationStatus).not.toHaveBeenCalled();
  });

  it('keeps reconciliation dry-run by default and confirms apply explicitly', async () => {
    const dryRun = dependencies();
    await runAppleIapServerCli([
      'reconcile', '--environment', 'sandbox', '--transaction-id', '1234',
    ], dryRun);
    expect(dryRun.reconcile).toHaveBeenCalledWith(expect.objectContaining({ apply: false }));

    const apply = dependencies();
    await expect(runAppleIapServerCli([
      'reconcile', '--environment', 'sandbox', '--transaction-id', '1234', '--apply',
    ], apply)).rejects.toThrow('apple_iap_server_cli_confirmation_invalid');
    await runAppleIapServerCli([
      'reconcile', '--environment', 'sandbox', '--transaction-id', '1234', '--apply',
      '--confirm', 'APPLY_APPLE_RECONCILIATION_SANDBOX',
    ], apply);
    expect(apply.reconcile).toHaveBeenCalledWith(expect.objectContaining({ apply: true }));
  });

  it('prints the applied and failed item report before returning a nonzero failure', async () => {
    const deps = dependencies();
    const failure = {
      accountId: '00000000-0000-4000-8000-000000000001',
      applied: 1,
      batchId: '00000000-0000-4000-8000-000000000099',
      checked: 3,
      environment: 'sandbox' as const,
      failure: {
        code: 'simulated_apply_failure',
        index: 1,
        stage: 'apply_item' as const,
        transactionReferenceHash: 'a'.repeat(64),
      },
      mode: 'apply' as const,
      pages: 1,
      planned: [],
      status: 'failed' as const,
      transactions: [],
    };
    deps.reconcile.mockRejectedValueOnce(new AppleServerReconciliationApplyError(
      'apple_server_reconciliation_apply_failed',
      failure,
    ));
    await expect(runAppleIapServerCli([
      'reconcile', '--environment', 'sandbox', '--transaction-id', '1234', '--apply',
      '--confirm', 'APPLY_APPLE_RECONCILIATION_SANDBOX',
    ], deps)).rejects.toThrow('apple_server_reconciliation_apply_failed');
    expect(deps.write).toHaveBeenCalledWith(expect.objectContaining({
      error: expect.objectContaining({
        code: 'apple_server_reconciliation_apply_failed',
        result: failure,
      }),
    }));
  });

  it('prints an explicit recovery handle when only final audit completion failed', async () => {
    const deps = dependencies();
    const batchId = '00000000-0000-4000-8000-000000000099';
    const failure = {
      accountId: '00000000-0000-4000-8000-000000000001',
      applied: 2,
      batchId,
      checked: 2,
      environment: 'sandbox' as const,
      failure: {
        code: 'simulated_finalization_audit_failure',
        index: 2,
        stage: 'batch_completed_audit' as const,
      },
      mode: 'apply' as const,
      pages: 1,
      planned: [],
      recovery: { resumeBatchId: batchId },
      status: 'finalization_failed' as const,
      transactions: [],
    };
    deps.reconcile.mockRejectedValueOnce(new AppleServerReconciliationApplyError(
      'apple_server_reconciliation_finalization_failed',
      failure,
    ));

    await expect(runAppleIapServerCli([
      'reconcile', '--environment', 'sandbox', '--transaction-id', '1234', '--apply',
      '--confirm', 'APPLY_APPLE_RECONCILIATION_SANDBOX',
    ], deps)).rejects.toThrow('apple_server_reconciliation_finalization_failed');
    expect(deps.write).toHaveBeenCalledWith(expect.objectContaining({
      error: expect.objectContaining({
        code: 'apple_server_reconciliation_finalization_failed',
        recoverable: true,
        resumeBatchId: batchId,
        result: failure,
      }),
    }));
  });

  it('only accepts a valid resume batch id for confirmed apply', async () => {
    const deps = dependencies();
    await expect(runAppleIapServerCli([
      'reconcile', '--environment', 'sandbox', '--transaction-id', '1234',
      '--resume-batch-id', '00000000-0000-4000-8000-000000000099',
    ], deps)).rejects.toThrow('apple_iap_server_cli_resume_batch_id_invalid');

    await runAppleIapServerCli([
      'reconcile', '--environment', 'sandbox', '--transaction-id', '1234', '--apply',
      '--confirm', 'APPLY_APPLE_RECONCILIATION_SANDBOX',
      '--resume-batch-id', '00000000-0000-4000-8000-000000000099',
    ], deps);
    expect(deps.reconcile).toHaveBeenCalledWith(expect.objectContaining({
      resumeBatchId: '00000000-0000-4000-8000-000000000099',
    }));
  });

  it('prints invocation and cumulative batch results separately after resume', async () => {
    const deps = dependencies();
    deps.reconcile.mockResolvedValueOnce({
      applied: 0,
      cumulativeBatchResult: { applied: 2, completed: 2 },
      status: 'completed',
    });
    await runAppleIapServerCli([
      'reconcile', '--environment', 'sandbox', '--transaction-id', '1234', '--apply',
      '--confirm', 'APPLY_APPLE_RECONCILIATION_SANDBOX',
      '--resume-batch-id', '00000000-0000-4000-8000-000000000099',
    ], deps);
    expect(deps.write).toHaveBeenCalledWith(expect.objectContaining({
      response: {
        applied: 0,
        cumulativeBatchResult: { applied: 2, completed: 2 },
        status: 'completed',
      },
    }));
  });
});
