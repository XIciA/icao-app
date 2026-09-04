import { z } from 'zod';

export const completeWechatAuthSchema = z.object({
  challengeId: z.uuid(),
  code: z.string().trim().min(6).max(512),
  state: z.string().trim().min(24).max(256),
}).strict();
