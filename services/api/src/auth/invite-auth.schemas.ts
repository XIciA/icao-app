import { z } from 'zod';

export const inviteSessionSchema = z.object({
  inviteCode: z.string().min(1).max(64),
});
