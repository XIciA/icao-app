import { Module } from '@nestjs/common';

import { AUTH_VERIFIER } from './auth/auth.types';
import { AccountController } from './account/account.controller';
import { AccountService } from './account/account.service';
import { MeController } from './auth/me.controller';
import { RequireAuthGuard } from './auth/require-auth.guard';
import { SessionSecurityService } from './auth/session-security.service';
import { SupabaseAuthVerifier } from './auth/supabase-auth.verifier';
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
import { AiService } from './ai/ai.service';
import { VocabularyController } from './vocabulary/vocabulary.controller';
import { VocabularyService } from './vocabulary/vocabulary.service';

@Module({
  controllers: [HealthController, MeController, AccountController, QuestionBankController, ResourceController, SyncController, AiController, VocabularyController],
  providers: [
    { provide: API_CONFIG, useFactory: () => loadConfig() },
    DatabaseService,
    SupabaseAuthVerifier,
    { provide: AUTH_VERIFIER, useExisting: SupabaseAuthVerifier },
    SessionSecurityService,
    RequireAuthGuard,
    AccountService,
    QuestionBankService,
    ResourceService,
    SyncService,
    AiAssetsService,
    AiProviderService,
    AiService,
    VocabularyService,
  ],
})
export class AppModule {}
