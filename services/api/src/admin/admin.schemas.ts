import { z } from 'zod';

export const opsReasonSchema = z.string().trim().min(8).max(500);

export const opsLoginSchema = z.object({
  email: z.email().max(254).transform((value) => value.trim().toLowerCase()),
  password: z.string().min(12).max(256),
  totpCode: z.string().trim().regex(/^(?:\d{6}|[A-Fa-f0-9]{4}(?:-[A-Fa-f0-9]{4}){3})$/u),
  deviceName: z.string().trim().min(2).max(120).optional(),
}).strict();

export const opsUserSearchSchema = z.object({
  query: z.string().trim().min(3).max(200),
  reason: opsReasonSchema,
}).strict();

export const opsReasonQuerySchema = z.object({ reason: opsReasonSchema }).strict();

export const opsStaffActionSchema = z.object({ reason: opsReasonSchema }).strict();

export const opsGrantPreviewSchema = z.object({
  aiMode: z.enum(["gift", "refill"]).optional(),
  accountId: z.uuid(),
  environment: z.enum(['sandbox', 'production']),
  membershipDays: z.number().int().min(0).max(366),
  aiPoints: z.number().int().min(0).max(1_000_000),
  reason: opsReasonSchema,
}).strict().refine((value) => value.membershipDays > 0 || value.aiPoints > 0 || value.aiMode === "refill")
  .refine((value) => value.aiMode === "refill" || value.aiPoints <= 100_000);

export const opsGrantExecuteSchema = z.object({
  confirmation: z.literal('确认发放'),
  confirmationToken: z.string().min(32).max(200),
}).strict();

export const opsEntitlementStateSchema = z.object({
  environment: z.enum(['sandbox', 'production']),
  serverTime: z.iso.datetime(),
  membership: z.object({
    active: z.boolean(),
    expiresAt: z.iso.datetime().nullable(),
  }).strict(),
  aiPoints: z.object({
    available: z.number().int().min(0),
    nextGrantAt: z.iso.datetime().nullable(),
  }).strict(),
}).strict();
