import { z } from 'zod';

export const verifyAppleTransactionSchema = z.object({
  signedTransaction: z.string()
    .min(100)
    .max(256 * 1024)
    .regex(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u),
}).strict();
