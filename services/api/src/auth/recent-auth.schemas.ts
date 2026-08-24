import { z } from 'zod';

export const passwordRecentAuthSchema = z.object({
  password: z.string().min(1).max(256),
  purpose: z.literal('account_delete'),
}).strict();

export const phoneRecentAuthSchema = z.object({
  purpose: z.literal('account_delete'),
}).strict();
