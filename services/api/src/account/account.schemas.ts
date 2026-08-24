import { z } from 'zod';

export const deleteAccountSchema = z.object({
  confirmation: z.literal('注销账号'),
  grantId: z.uuid(),
  idempotencyKey: z.uuid(),
}).strict();

export const accountDeletionStatusSchema = z.object({
  idempotencyKey: z.uuid(),
}).strict();

export const mergePhoneAccountSchema = z.object({
  phone: z.string().regex(/^\+861[3-9]\d{9}$/u),
  token: z.string().regex(/^\d{6}$/u),
}).strict();

export const startPhoneBindingSchema = z.object({
  phone: z.string().regex(/^\+861[3-9]\d{9}$/u),
}).strict();

export const updatePhonePasswordSchema = z.object({
  password: z.string().min(10).max(64).regex(/[A-Za-z]/u).regex(/[0-9]/u),
  currentPassword: z.string().min(1).max(256).optional(),
  recoveryGrantId: z.uuid().optional(),
}).strict();
