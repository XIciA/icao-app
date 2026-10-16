import { ContentPreviewStorageService } from './admin/content-preview-storage.service';
import { ContentWorkflowController } from './admin/content-workflow.controller';
import { ContentWorkflowService } from './admin/content-workflow.service';
import { AdminUsersController } from './admin/admin-users.controller';
import { AdminGlobalResetService } from './admin/admin-global-reset.service';
import { AdminReportsController } from './admin/admin-reports.controller';
import { AiAllowanceService } from './commerce/ai-allowance.service';
import { AiUsageRulesService } from './commerce/ai-usage-rules.service';
import { AdminAiRulesController } from './commerce/admin-ai-rules.controller';
import { type DynamicModule, Module } from '@nestjs/common';

import { AccountIdentityService } from './account/account-identity.service';
import { AdminAuthController, AdminController } from './admin/admin.controller';
import { AdminAuditService } from './admin/admin-audit.service';
import { AdminAuthService } from './admin/admin-auth.service';
import { RequireAdminAuthGuard } from './admin/admin-auth.guard';
import { AdminDataService } from './admin/admin-data.service';
import { AdminEntitlementService } from './admin/admin-entitlement.service';
import { OpsLoginRateLimiter } from './admin/admin-login-rate-limiter';
import { AdminRoleGuard } from './admin/admin-role.guard';
import { AdminStaffService } from './admin/admin-staff.service';
import { AdminFeedbackStorageService } from './admin/admin-feedback-storage.service';
import { CommerceService } from './commerce/commerce.service';
import { APPLE_STORE_VERIFIER, type AppleStoreVerifier } from './commerce/apple-store-verifier';
import { PersistentCommerceBenefitsService } from './commerce/persistent-commerce-benefits.service';
import { loadOpsConfig, OPS_API_CONFIG, type OpsApiConfig } from './config';
import { DatabaseService } from './database/database.service';
import { OpsHealthController } from './ops-health.controller';

const unavailableAppleVerifier: AppleStoreVerifier = {
  verifyNotification: async () => { throw new Error('ops_api_apple_verifier_unavailable'); },
  verifyTransaction: async () => { throw new Error('ops_api_apple_verifier_unavailable'); },
};

@Module({})
export class OpsApiModule {
  static forRoot(config: OpsApiConfig = loadOpsConfig()): DynamicModule {
    return {
      module: OpsApiModule,
      controllers: [ContentWorkflowController, AdminUsersController, AdminReportsController, AdminAiRulesController, OpsHealthController, AdminAuthController, AdminController],
      providers: [ContentWorkflowService, ContentPreviewStorageService,
        { provide: OPS_API_CONFIG, useValue: config },
        {
          provide: DatabaseService,
          inject: [OPS_API_CONFIG],
          useFactory: (opsConfig: OpsApiConfig) => new DatabaseService(opsConfig),
        },
        AiUsageRulesService,
    AiAllowanceService,
    PersistentCommerceBenefitsService,
        {
          provide: AccountIdentityService,
          inject: [OPS_API_CONFIG, DatabaseService, PersistentCommerceBenefitsService],
          useFactory: (
            opsConfig: OpsApiConfig,
            database: DatabaseService,
            benefits: PersistentCommerceBenefitsService,
          ) => new AccountIdentityService(opsConfig, database, undefined, benefits),
        },
        { provide: APPLE_STORE_VERIFIER, useValue: unavailableAppleVerifier },
        {
          provide: CommerceService,
          inject: [DatabaseService, APPLE_STORE_VERIFIER, PersistentCommerceBenefitsService],
          useFactory: (
            database: DatabaseService,
            appleVerifier: AppleStoreVerifier,
            benefits: PersistentCommerceBenefitsService,
          ) => new CommerceService({}, database, appleVerifier, benefits),
        },
        AdminAuditService,
        OpsLoginRateLimiter,
        AdminAuthService,
        RequireAdminAuthGuard,
        AdminRoleGuard,
        AdminDataService,
        AdminGlobalResetService,
        AdminEntitlementService,
        AdminStaffService,
        AdminFeedbackStorageService,
      ],
    };
  }
}
