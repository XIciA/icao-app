import { z } from 'zod';
import { isValidPhonePassword } from '@icao/contracts/native-auth';

export const deleteAccountSchema = z.object({
  confirmation: z.literal('注销账号'),
  grantId: z.uuid(),
  idempotencyKey: z.uuidv4(),
}).strict();

export const revokeAllSessionsSchema = z.object({
  grantId: z.uuid(),
}).strict();

export const accountDeletionStatusSchema = z.object({
  idempotencyKey: z.uuidv4(),
}).strict();

export const deleteAllAiResultsSchema = z.object({
  confirmation: z.literal('删除全部AI结果'),
  idempotencyKey: z.uuidv4(),
}).strict();

export const clearLearningDataSchema = z.object({
  confirmation: z.literal('清除学习数据'),
  idempotencyKey: z.uuidv4(),
}).strict();

export const bindPhoneSchema = z.object({
  challengeId: z.uuid(),
  phone: z.string().regex(/^\+861[3-9]\d{9}$/u),
  recentAuthGrantId: z.uuid().optional(),
  token: z.string().regex(/^\d{6}$/u),
}).strict();

export const authorizePasswordRecoverySchema = z.object({
  challengeId: z.uuid(),
}).strict();

export const startPhoneBindingSchema = z.object({
  phone: z.string().regex(/^\+861[3-9]\d{9}$/u),
  recentAuthGrantId: z.uuid().optional(),
}).strict();

export const updatePhonePasswordSchema = z.object({
  password: z.string().refine(isValidPhonePassword),
  currentPassword: z.string().min(1).max(256).optional(),
  recoveryGrantId: z.uuid().optional(),
}).strict();
