import { describe, expect, it, vi } from 'vitest';

import { runAppleIapServerCli } from '../src/apple-iap-server-cli';

function dependencies() {
  return {
    isRoot: vi.fn(() => true),
    reconcile: vi.fn(async () => ({ checked: 1 })),
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
    expect(deps.reconcile).not.toHaveBeenCalled();
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
});
