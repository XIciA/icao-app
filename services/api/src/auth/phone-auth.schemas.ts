import { z } from 'zod';

export const startPhoneOtpSchema = z.object({
  phone: z.string().regex(/^\+861[3-9]\d{9}$/u),
}).strict();
