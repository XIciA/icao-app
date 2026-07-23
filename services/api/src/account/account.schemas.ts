import { z } from 'zod';

export const deleteAccountSchema = z.object({
  inviteCode: z.string().min(1).max(64),
  confirmation: z.literal('注销账号'),
});
