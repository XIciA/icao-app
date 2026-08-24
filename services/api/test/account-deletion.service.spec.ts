import { describe, expect, it, vi } from 'vitest';

import type { AppleAuthService } from '../src/auth/apple-auth.service';
import type { RecentAuthService } from '../src/auth/recent-auth.service';
import type { PersistentCommerceBenefitsService } from '../src/commerce/persistent-commerce-benefits.service';
import type { ApiConfig } from '../src/config';
import type { DatabaseService } from '../src/database/database.service';
import type { FeedbackService } from '../src/feedback/feedback.service';
import type { AccountAuthAdmin } from '../src/account/account-auth-admin';
import { AccountDeletionService } from '../src/account/account-deletion.service';

describe('AccountDeletionService', () => {
  it('logs only a stable worker error code when a retry fails', async () => {
    const service = new AccountDeletionService(
      { accountIdentityHashSecret: 'test-account-identity-secret-that-is-long-enough' } as ApiConfig,
      {} as AccountAuthAdmin,
      {} as AppleAuthService,
      {} as PersistentCommerceBenefitsService,
      {} as DatabaseService,
      {} as FeedbackService,
      {} as RecentAuthService,
    );
    const sensitiveFailure = 'provider rejected auth-user-secret@example.com token=raw-refresh-token';
    vi.spyOn(service, 'retryDueJobs').mockRejectedValue(new Error(sensitiveFailure));
    const logger = Reflect.get(service, 'logger') as { error(message: string): void };
    const error = vi.spyOn(logger, 'error').mockImplementation(() => undefined);

    service.onModuleInit();
    await vi.waitFor(() => expect(error).toHaveBeenCalledWith('account_deletion_retry_worker_failed'));
    service.onModuleDestroy();

    expect(JSON.stringify(error.mock.calls)).not.toContain(sensitiveFailure);
    expect(JSON.stringify(error.mock.calls)).not.toContain('raw-refresh-token');
  });
});
