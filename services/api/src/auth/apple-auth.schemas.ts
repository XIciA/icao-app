import { z } from 'zod';

export const appleCredentialSchema = z.object({
  authorizationCode: z.string().min(8).max(4_096),
  rawNonce: z.string().min(16).max(256),
}).strict();

export const appleRecentAuthSchema = appleCredentialSchema.extend({
  purpose: z.literal('account_delete'),
}).strict();
