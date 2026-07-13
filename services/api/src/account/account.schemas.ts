import { z } from 'zod';

export const deleteAccountSchema = z.object({
  currentPassword: z.string().min(8).max(64),
  confirmation: z.literal('注销账号'),
});
