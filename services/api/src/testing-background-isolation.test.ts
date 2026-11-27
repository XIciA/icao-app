import { afterEach, describe, expect, it, vi } from 'vitest';
import { AccountDeletionService } from './account/account-deletion.service';
import { AccountLoginMethodsService } from './account/account-login-methods.service';
import { AsrAudioStorageService } from './ai/asr-audio-storage.service';
import { AppleAuthService } from './auth/apple-auth.service';
import { PhoneSecurityRetentionService } from './auth/phone-security-retention.service';
import { AppleNotificationReconciliationService } from './commerce/apple-notification-reconciliation.service';
import { ContentAccessRetentionService } from './content-access/content-access-retention.service';
import { FeedbackCleanupService } from './feedback/feedback-cleanup.service';

afterEach(() => vi.unstubAllEnvs());

describe('isolated testing snapshot background jobs', () => {
  it.each([
    AccountDeletionService, AccountLoginMethodsService, AsrAudioStorageService,
    AppleAuthService, PhoneSecurityRetentionService, AppleNotificationReconciliationService,
    ContentAccessRetentionService, FeedbackCleanupService,
  ])('does not start %s or touch restored account state', (Service) => {
    vi.stubEnv('ICAO_DATA_ENVIRONMENT', 'testing');
    // Any dependency access means a copied job could run. No DB/queue is supplied.
    const service = new Proxy({}, { get() { throw new Error('testing_background_dependency_access'); } });
    expect(() => Service.prototype.onModuleInit.call(service as never)).not.toThrow();
  });
});
