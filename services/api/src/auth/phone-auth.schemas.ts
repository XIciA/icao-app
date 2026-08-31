import { z } from 'zod';

export const startPhoneOtpSchema = z.object({
  phone: z.string().regex(/^\+861[3-9]\d{9}$/u),
}).strict();

export const verifyPhoneOtpSchema = z.object({
  challengeId: z.uuid(),
  phone: z.string().regex(/^\+861[3-9]\d{9}$/u),
  purpose: z.enum(['login', 'recovery']),
  token: z.string().regex(/^\d{6}$/u),
}).strict();
