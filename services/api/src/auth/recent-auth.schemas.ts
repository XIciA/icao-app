import { z } from 'zod';

export const passwordRecentAuthSchema = z.object({
  password: z.string().min(1).max(256),
  purpose: z.literal('account_delete'),
}).strict();

export const startPhoneRecentAuthSchema = z.object({
  purpose: z.literal('account_delete'),
}).strict();

export const phoneRecentAuthSchema = z.object({
  challengeId: z.uuid(),
  purpose: z.literal('account_delete'),
  token: z.string().regex(/^\d{6}$/u),
}).strict();

export const wechatRecentAuthSchema = z.object({
  challengeId: z.uuid(),
  code: z.string().trim().min(6).max(512),
  purpose: z.literal('account_delete'),
  state: z.string().trim().min(24).max(256),
}).strict();

export const startWechatRecentAuthSchema = z.object({
  purpose: z.literal('account_delete'),
}).strict();
