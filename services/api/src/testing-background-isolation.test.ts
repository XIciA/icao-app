import { afterEach, describe, expect, it, vi } from 'vitest';
import { AccountDeletionService } from './account/account-deletion.service';
import { AccountLoginMethodsService } from './account/account-login-methods.service';
import { AsrAudioStorageService } from './ai/asr-audio-storage.service';
import { AppleAuthService } from './auth/apple-auth.service';
import { PhoneSecurityRetentionService } from './auth/phone-security-retention.service';
import { AppleNotificationReconciliationService } from './commerce/apple-notification-reconciliation.service';
import { ContentAccessRetentionService } from './content-access/content-access-retention.service';
import { FeedbackCleanupService } from './feedback/feedback-cleanup.service';

afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });

describe('full testing runtime background jobs', () => {
  it.each([
    AccountDeletionService, AccountLoginMethodsService, AsrAudioStorageService,
    AppleAuthService, PhoneSecurityRetentionService, AppleNotificationReconciliationService,
    ContentAccessRetentionService, FeedbackCleanupService,
  ])('starts and stops %s in the testing data environment', (Service) => {
    vi.stubEnv('ICAO_DATA_ENVIRONMENT', 'testing');
    vi.useFakeTimers();
    const service = {
      nodeEnv: 'production', config: { nodeEnv: 'production' },
      retryDueJobs: vi.fn().mockResolvedValue(undefined),
      runScheduled: vi.fn().mockResolvedValue(undefined),
      runScheduledCleanup: vi.fn().mockResolvedValue(undefined),
    };
    Service.prototype.onModuleInit.call(service as never);
    expect(vi.getTimerCount()).toBe(Service === AccountDeletionService ? 2 : 1);
    Service.prototype.onModuleDestroy.call(service as never);
    expect(vi.getTimerCount()).toBe(0);
  });
});
