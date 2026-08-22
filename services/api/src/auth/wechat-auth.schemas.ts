import { z } from 'zod';

export const wechatSessionSchema = z.object({
  code: z.string().trim().min(8).max(256).regex(/^[A-Za-z0-9._-]+$/u),
}).strict();
