import { Module } from '@nestjs/common';

import { AUTH_VERIFIER } from './auth/auth.types';
import { AccountController } from './account/account.controller';
import { AccountService } from './account/account.service';
import { AccountIdentityService } from './account/account-identity.service';
import { MeController } from './auth/me.controller';
import { PhoneAuthController } from './auth/phone-auth.controller';
import { PhoneAuthService } from './auth/phone-auth.service';
import { RequireAuthGuard } from './auth/require-auth.guard';
import { RecentSocialAuthGrantService } from './auth/recent-social-auth-grant.service';
import { SessionSecurityService } from './auth/session-security.service';
import { SupabaseAuthVerifier } from './auth/supabase-auth.verifier';
import { WechatAuthController } from './auth/wechat-auth.controller';
import { WechatAuthService } from './auth/wechat-auth.service';
import { AliyunSmsProvider } from './auth/sms/aliyun-sms.provider';
import { SupabaseSmsHookController } from './auth/sms/supabase-sms-hook.controller';
import { SupabaseSmsHookService } from './auth/sms/supabase-sms-hook.service';
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
import { AiAssetsService } from './ai/ai-assets.service';
import { AiProviderService } from './ai/ai-provider.service';
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

@Module({
  controllers: [HealthController, MeController, PhoneAuthController, SupabaseSmsHookController, WechatAuthController, AccountController, QuestionBankController, ResourceController, EditorialController, SyncController, AiController, VocabularyController, FeedbackController],
  providers: [
    { provide: API_CONFIG, useFactory: () => loadConfig() },
    DatabaseService,
    SupabaseAuthVerifier,
    { provide: AUTH_VERIFIER, useExisting: SupabaseAuthVerifier },
    SessionSecurityService,
    AccountIdentityService,
    RecentSocialAuthGrantService,
    RequireAuthGuard,
    AliyunSmsProvider,
    SupabaseSmsHookService,
    PhoneAuthService,
    WechatAuthService,
    AccountService,
    QuestionBankService,
    ResourceService,
    EditorialService,
    SyncService,
    AiAssetsService,
    AiProviderService,
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
