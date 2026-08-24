import { Module } from '@nestjs/common';

import { AUTH_VERIFIER } from './auth/auth.types';
import { AccountController } from './account/account.controller';
import { AccountService } from './account/account.service';
import { AccountIdentityService } from './account/account-identity.service';
import { AccountDeletionService } from './account/account-deletion.service';
import { AccountDeletionStatusController } from './account/account-deletion-status.controller';
import { ACCOUNT_AUTH_ADMIN, SupabaseAccountAuthAdmin } from './account/account-auth-admin';
import { IdentityDigestService } from './account/identity-digest.service';
import { AppleAuthController } from './auth/apple-auth.controller';
import { AppleAuthService } from './auth/apple-auth.service';
import { APPLE_AUTH_HTTP, FetchAppleAuthHttp } from './auth/apple-auth-http';
import { APPLE_ID_TOKEN_VERIFIER, JoseAppleIdTokenVerifier } from './auth/apple-id-token.verifier';
import { MeController } from './auth/me.controller';
import { PhoneAuthController } from './auth/phone-auth.controller';
import { PhoneAuthService } from './auth/phone-auth.service';
import { PhoneSecurityRetentionService } from './auth/phone-security-retention.service';
import { RecentAuthController } from './auth/recent-auth.controller';
import { RecentAuthService } from './auth/recent-auth.service';
import { RECENT_AUTH_PASSWORD_VERIFIER, SupabaseRecentAuthPasswordVerifier } from './auth/recent-auth-password.verifier';
import { RequireAuthGuard } from './auth/require-auth.guard';
import { SessionSecurityService } from './auth/session-security.service';
import { SupabaseAuthVerifier } from './auth/supabase-auth.verifier';
import { AliyunSmsProvider } from './auth/sms/aliyun-sms.provider';
import { SupabaseSmsHookController } from './auth/sms/supabase-sms-hook.controller';
import { SupabaseSmsHookService } from './auth/sms/supabase-sms-hook.service';
import { SmsDeliveryAuthority } from './auth/sms/sms-delivery-authority';
import { API_CONFIG, loadConfig } from './config';
import { DatabaseService } from './database/database.service';
import { HealthController } from './health.controller';
import { QuestionBankController } from './question-bank/question-bank.controller';
import { QuestionBankService } from './question-bank/question-bank.service';
import { ResourceController } from './resource/resource.controller';
import { ResourceService } from './resource/resource.service';
import { SyncController } from './sync/sync.controller';
import { SyncService } from './sync/sync.service';
import { AiController } from './ai/ai.controller';
import { DeepSeekReviewProviderService } from './ai/deepseek-review-provider.service';
import { AsrAudioStorageService } from './ai/asr-audio-storage.service';
import { TencentAsrService } from './ai/tencent-asr.service';
import { AiService } from './ai/ai.service';
import { VocabularyController } from './vocabulary/vocabulary.controller';
import { VocabularyService } from './vocabulary/vocabulary.service';
import { EditorialController } from './editorial/editorial.controller';
import { EditorialService } from './editorial/editorial.service';
import { FeedbackAttachmentStorage } from './feedback/feedback-attachment-storage';
import { FeedbackCleanupService } from './feedback/feedback-cleanup.service';
import { FeedbackController } from './feedback/feedback.controller';
import { FeedbackService } from './feedback/feedback.service';
import { PersistentCommerceBenefitsService } from './commerce/persistent-commerce-benefits.service';
import { AppleNotificationController } from './commerce/apple-notification.controller';
import { CommerceController } from './commerce/commerce.controller';
import { CommerceService } from './commerce/commerce.service';
import { APPLE_STORE_VERIFIER, configuredAppleStoreVerifier } from './commerce/apple-store-verifier';

@Module({
  controllers: [HealthController, MeController, PhoneAuthController, RecentAuthController, AppleAuthController, SupabaseSmsHookController, AccountController, AccountDeletionStatusController, QuestionBankController, ResourceController, EditorialController, SyncController, AiController, VocabularyController, FeedbackController, CommerceController, AppleNotificationController],
  providers: [
    { provide: API_CONFIG, useFactory: () => loadConfig() },
    DatabaseService,
    SupabaseAuthVerifier,
    { provide: AUTH_VERIFIER, useExisting: SupabaseAuthVerifier },
    SessionSecurityService,
    AccountIdentityService,
    IdentityDigestService,
    PersistentCommerceBenefitsService,
    { provide: APPLE_STORE_VERIFIER, inject: [API_CONFIG], useFactory: configuredAppleStoreVerifier },
    CommerceService,
    RequireAuthGuard,
    AliyunSmsProvider,
    SmsDeliveryAuthority,
    SupabaseSmsHookService,
    PhoneAuthService,
    PhoneSecurityRetentionService,
    SupabaseRecentAuthPasswordVerifier,
    { provide: RECENT_AUTH_PASSWORD_VERIFIER, useExisting: SupabaseRecentAuthPasswordVerifier },
    RecentAuthService,
    FetchAppleAuthHttp,
    { provide: APPLE_AUTH_HTTP, useExisting: FetchAppleAuthHttp },
    JoseAppleIdTokenVerifier,
    { provide: APPLE_ID_TOKEN_VERIFIER, useExisting: JoseAppleIdTokenVerifier },
    AppleAuthService,
    AccountService,
    SupabaseAccountAuthAdmin,
    { provide: ACCOUNT_AUTH_ADMIN, useExisting: SupabaseAccountAuthAdmin },
    AccountDeletionService,
    QuestionBankService,
    ResourceService,
    EditorialService,
    SyncService,
    DeepSeekReviewProviderService,
    AsrAudioStorageService,
    TencentAsrService,
    AiService,
    VocabularyService,
    FeedbackAttachmentStorage,
    FeedbackCleanupService,
    FeedbackService,
  ],
})
export class AppModule {}
