import { Module } from '@nestjs/common';

import { AUTH_VERIFIER } from './auth/auth.types';
import { MeController } from './auth/me.controller';
import { RequireAuthGuard } from './auth/require-auth.guard';
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

@Module({
  controllers: [HealthController, MeController, QuestionBankController, ResourceController, SyncController, AiController],
  providers: [
    { provide: API_CONFIG, useFactory: () => loadConfig() },
    DatabaseService,
    SupabaseAuthVerifier,
    { provide: AUTH_VERIFIER, useExisting: SupabaseAuthVerifier },
    RequireAuthGuard,
    QuestionBankService,
    ResourceService,
    SyncService,
    AiAssetsService,
    AiProviderService,
    AiService,
  ],
})
export class AppModule {}
