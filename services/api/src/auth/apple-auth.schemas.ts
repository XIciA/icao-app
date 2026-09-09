import { z } from 'zod';

export const appleCredentialSchema = z.object({
  authorizationCode: z.string().min(8).max(4_096),
  rawNonce: z.string().min(16).max(256),
}).strict();

export const appleRecentAuthSchema = appleCredentialSchema.extend({
  providerAccessToken: z.string().min(16).max(16_384).optional(),
  purpose: z.enum(['account_delete', 'phone_binding', 'session_revoke_all', 'apple_binding', 'wechat_binding', 'apple_unbinding', 'wechat_unbinding']),
}).strict();
