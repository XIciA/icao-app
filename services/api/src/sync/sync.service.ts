import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import type {
  AccountDataExportResponse,
  CardStateMutation,
  ClearLearningDataRequest,
  DeleteAllAiResultsRequest,
  DocumentMutation,
  LearningRecordMutation,
  PrivacyDeletionResponse,
  SyncCardState,
  SyncChange,
  SyncMutation,
  SyncPullResponse,
  SyncPushRequest,
  SyncPushResponse,
  SyncPushResult,
} from '@icao/contracts';
import { createHash } from 'node:crypto';
import { and, asc, desc, eq, gt, lt, sql } from 'drizzle-orm';
import { z } from 'zod';

import { DatabaseService } from '../database/database.service';
import { accounts, learningRecords, privacyActionReceipts, profiles, syncChanges, syncMutations, userCardStates, userDocuments } from '../database/schema';
import { mergeVocabularyDocuments, vocabularyDocumentSchema } from './vocabulary-document';

const VOCABULARY_DOCUMENT_KEY = 'vocabulary';

const stateSchema = z.object({
  visited: z.boolean(),
  completed: z.boolean(),
  selectedChoiceIndex: z.number().int().nonnegative().optional(),
  recorded: z.boolean().optional(),
  recordingDurationMillis: z.number().int().nonnegative().optional(),
  tagIds: z.array(z.string()).optional(),
  highlights: z.array(z.object({
    blockId: z.enum(['question', 'reference']),
    wordIndex: z.number().int().nonnegative(),
    colorId: z.string(),
    quote: z.string(),
  })).optional(),
  note: z.string(),
  updatedAt: z.string().datetime(),
});

const cardMutationSchema = z.object({
  mutationId: z.string().min(1).max(160),
  kind: z.literal('card_state'),
  payload: z.object({
    bankId: z.string().min(1).max(100),
    topicId: z.string().min(1).max(200),
    cardId: z.string().min(1).max(200),
    state: stateSchema,
    version: z.number().int().positive(),
    updatedAt: z.string().datetime(),
  }),
});

const recordMutationSchema = z.object({
  mutationId: z.string().min(1).max(160),
  kind: z.literal('learning_record'),
  payload: z.object({
    recordId: z.string().min(1).max(200),
    record: z.record(z.string(), z.unknown()).optional(),
    deleted: z.boolean().optional(),
    aiResultGeneration: z.number().int().nonnegative().optional(),
    occurredAt: z.string().datetime(),
    version: z.number().int().positive().optional(),
    updatedAt: z.string().datetime().optional(),
  }).refine((payload) => payload.deleted === true || payload.record !== undefined),
});

const documentMutationSchema = z.object({
  mutationId: z.string().min(1).max(160),
  kind: z.literal('document'),
  payload: z.object({
    documentKey: z.string().min(1).max(100),
    document: z.record(z.string(), z.unknown()),
    version: z.number().int().positive(),
    updatedAt: z.string().datetime(),
  }),
});

const pushSchema = z.object({
  ownerUserId: z.string().uuid().optional(),
  cursor: z.number().int().nonnegative().optional(),
  dataGeneration: z.number().int().nonnegative().optional(),
  aiResultGeneration: z.number().int().nonnegative().optional(),
  mutations: z.array(z.discriminatedUnion('kind', [cardMutationSchema, recordMutationSchema, documentMutationSchema])).max(100),
});

const privacyDeletionResponseSchema = z.object({
  aiResultGeneration: z.number().int().nonnegative(),
  dataGeneration: z.number().int().nonnegative(),
  deletedCount: z.number().int().nonnegative(),
});

type PrivacyAction = 'delete_all_ai_results' | 'clear_learning_data';
type PrivacyActionRequest = DeleteAllAiResultsRequest | ClearLearningDataRequest;

function hashMutation(mutation: SyncMutation) {
  return createHash('sha256').update(JSON.stringify(mutation)).digest('hex');
}

function hashPrivacyRequest(action: PrivacyAction, request: PrivacyActionRequest) {
  return createHash('sha256').update(JSON.stringify({
    action,
    confirmation: request.confirmation,
    idempotencyKey: request.idempotencyKey,
  })).digest('hex');
}

function entityKey(mutation: CardStateMutation) {
  return [mutation.payload.bankId, mutation.payload.topicId, mutation.payload.cardId].join(':');
}

@Injectable()
export class SyncService {
  constructor(private readonly database: DatabaseService) {}

  async push(userId: string, raw: SyncPushRequest): Promise<SyncPushResponse> {
    const parsed = pushSchema.safeParse(raw);
    if (!parsed.success) throw new BadRequestException('invalid_sync_payload');
    if (parsed.data.ownerUserId && parsed.data.ownerUserId !== userId) throw new ConflictException('sync_user_mismatch');

    const response = await this.database.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`learning:${userId}`}, 0))`);
      const [account] = await tx.select({
        aiResultGeneration: accounts.aiResultGeneration,
        dataGeneration: accounts.learningDataGeneration,
      }).from(accounts).where(eq(accounts.id, userId)).limit(1);
      if (!account) throw new ConflictException('sync_user_mismatch');
      const requestedDataGeneration = parsed.data.dataGeneration ?? 0;
      const requestedAiResultGeneration = parsed.data.aiResultGeneration ?? 0;
      if (requestedDataGeneration !== account.dataGeneration) {
        return {
          aiResultGeneration: account.aiResultGeneration,
          dataGeneration: account.dataGeneration,
          resetLearningData: true as const,
          results: parsed.data.mutations.map((mutation) => ({
            mutationId: mutation.mutationId,
            status: 'discarded' as const,
          })),
        };
      }
      await tx.insert(profiles).values({ userId }).onConflictDoNothing();
      const output: SyncPushResult[] = [];
      for (const mutation of parsed.data.mutations as SyncMutation[]) {
        const isAiResult = mutation.kind === 'learning_record'
          && (mutation.payload.deleted === true || mutation.payload.record?.recordType === 'ai_result');
        if (isAiResult && requestedAiResultGeneration !== account.aiResultGeneration) {
          output.push({ mutationId: mutation.mutationId, status: 'discarded' });
          continue;
        }
        const payloadHash = hashMutation(mutation);
        const [existingMutation] = await tx.select().from(syncMutations).where(and(
          eq(syncMutations.userId, userId),
          eq(syncMutations.mutationId, mutation.mutationId),
        )).limit(1);
        if (existingMutation) {
          if (existingMutation.payloadHash !== payloadHash) throw new ConflictException('mutation_id_reused');
          const previous = existingMutation.result as SyncPushResult | null;
          output.push({ ...(previous ?? { mutationId: mutation.mutationId, status: 'duplicate' }), status: 'duplicate' });
          continue;
        }

        const result = mutation.kind === 'card_state'
          ? await this.applyCardState(tx, userId, mutation)
          : mutation.kind === 'learning_record'
            ? await this.applyLearningRecord(tx, userId, mutation, account.aiResultGeneration)
            : await this.applyDocument(tx, userId, mutation);
        await tx.insert(syncMutations).values({
          userId,
          mutationId: mutation.mutationId,
          kind: mutation.kind,
          payloadHash,
          result,
        });
        output.push(result);
      }
      return {
        aiResultGeneration: account.aiResultGeneration,
        dataGeneration: account.dataGeneration,
        resetAiResults: requestedAiResultGeneration !== account.aiResultGeneration,
        results: output,
      };
    });

    return {
      ...response,
      cursor: response.resetLearningData ? parsed.data.cursor ?? 0 : await this.latestCursor(userId),
    };
  }

  private async applyCardState(
    tx: Parameters<Parameters<typeof this.database.db.transaction>[0]>[0],
    userId: string,
    mutation: CardStateMutation,
  ): Promise<SyncPushResult> {
    const target = and(
      eq(userCardStates.userId, userId),
      eq(userCardStates.bankId, mutation.payload.bankId),
      eq(userCardStates.topicId, mutation.payload.topicId),
      eq(userCardStates.cardId, mutation.payload.cardId),
    );
    const [current] = await tx.select().from(userCardStates).where(target).limit(1);
    if (current && mutation.payload.version <= current.version) {
      const currentState = current.state as CardStateMutation['payload']['state'];
      const gainedProgress = (mutation.payload.state.visited && !currentState.visited)
        || (mutation.payload.state.completed && !currentState.completed);
      if (gainedProgress) {
        const updatedAt = new Date();
        const version = current.version + 1;
        const state = {
          ...currentState,
          visited: currentState.visited || mutation.payload.state.visited,
          completed: currentState.completed || mutation.payload.state.completed,
          updatedAt: updatedAt.toISOString(),
        };
        await tx.update(userCardStates).set({ state, version, updatedAt }).where(target);
        const payload = {
          bankId: current.bankId,
          topicId: current.topicId,
          cardId: current.cardId,
          state,
          version,
          updatedAt: updatedAt.toISOString(),
        };
        await tx.insert(syncChanges).values({
          userId,
          kind: mutation.kind,
          entityKey: entityKey(mutation),
          payload,
          version,
        });
        return { mutationId: mutation.mutationId, status: 'conflict', authoritative: payload };
      }
      return {
        mutationId: mutation.mutationId,
        status: 'conflict',
        authoritative: {
          bankId: current.bankId,
          topicId: current.topicId,
          cardId: current.cardId,
          state: currentState,
          version: current.version,
          updatedAt: current.updatedAt.toISOString(),
        },
      };
    }

    const updatedAt = new Date(mutation.payload.updatedAt);
    const state = current ? {
      ...mutation.payload.state,
      visited: (current.state as CardStateMutation['payload']['state']).visited || mutation.payload.state.visited,
      completed: (current.state as CardStateMutation['payload']['state']).completed || mutation.payload.state.completed,
      updatedAt: updatedAt.toISOString(),
    } : mutation.payload.state;
    const values = {
      userId,
      bankId: mutation.payload.bankId,
      topicId: mutation.payload.topicId,
      cardId: mutation.payload.cardId,
      state,
      version: mutation.payload.version,
      updatedAt,
    };
    if (current) await tx.update(userCardStates).set(values).where(target);
    else await tx.insert(userCardStates).values(values);
    const payload = { ...mutation.payload, updatedAt: values.updatedAt.toISOString() };
    await tx.insert(syncChanges).values({
      userId,
      kind: mutation.kind,
      entityKey: entityKey(mutation),
      payload,
      version: mutation.payload.version,
    });
    return { mutationId: mutation.mutationId, status: 'accepted', authoritative: payload };
  }

  private async applyLearningRecord(
    tx: Parameters<Parameters<typeof this.database.db.transaction>[0]>[0],
    userId: string,
    mutation: LearningRecordMutation,
    aiResultGeneration: number,
  ): Promise<SyncPushResult> {
    const target = and(
      eq(learningRecords.userId, userId),
      eq(learningRecords.clientRecordId, mutation.payload.recordId),
    );
    const version = mutation.payload.version ?? 1;
    const occurredAt = new Date(mutation.payload.occurredAt);
    const updatedAt = new Date(mutation.payload.updatedAt ?? mutation.payload.occurredAt);
    const deleting = mutation.payload.deleted === true;
    const incomingRecord = deleting ? { deleted: true } : mutation.payload.record!;
    const incomingIsAiResult = deleting || mutation.payload.record?.recordType === 'ai_result';
    const [current] = await tx.select().from(learningRecords).where(target).limit(1);
    const currentDeleted = (current?.payload as { deleted?: unknown } | undefined)?.deleted === true;
    if (currentDeleted && !deleting) {
      return {
        mutationId: mutation.mutationId,
        status: 'conflict',
        authoritative: {
          recordId: current!.clientRecordId,
          deleted: true,
          aiResultGeneration,
          occurredAt: current!.occurredAt.toISOString(),
          version: current!.version,
          updatedAt: current!.updatedAt.toISOString(),
        },
      };
    }
    const values = {
      userId,
      clientRecordId: mutation.payload.recordId,
      payload: incomingRecord,
      occurredAt,
      version,
      updatedAt,
    };
    const [applied] = await tx.insert(learningRecords).values(values).onConflictDoUpdate({
      target: [learningRecords.userId, learningRecords.clientRecordId],
      set: {
        payload: values.payload,
        occurredAt: values.occurredAt,
        version: values.version,
        updatedAt: values.updatedAt,
      },
      setWhere: lt(learningRecords.version, version),
    }).returning();
    if (!applied) {
      const [current] = await tx.select().from(learningRecords).where(target).limit(1);
      if (!current) throw new ConflictException('learning_record_conflict');
      const currentIsAiResult = (current.payload as { deleted?: unknown; recordType?: unknown }).deleted === true
        || (current.payload as { recordType?: unknown }).recordType === 'ai_result';
      return {
        mutationId: mutation.mutationId,
        status: 'conflict',
        authoritative: {
          recordId: current.clientRecordId,
          ...((current.payload as { deleted?: unknown }).deleted === true
            ? { deleted: true as const }
            : { record: current.payload as Record<string, unknown> }),
          ...(currentIsAiResult ? { aiResultGeneration } : {}),
          occurredAt: current.occurredAt.toISOString(),
          version: current.version,
          updatedAt: current.updatedAt.toISOString(),
        },
      };
    }
    const payload = {
      recordId: applied.clientRecordId,
      ...(deleting ? { deleted: true as const } : { record: applied.payload as Record<string, unknown> }),
      ...(incomingIsAiResult ? { aiResultGeneration } : {}),
      occurredAt: applied.occurredAt.toISOString(),
      version: applied.version,
      updatedAt: applied.updatedAt.toISOString(),
    };
    await tx.insert(syncChanges).values({
      userId,
      kind: mutation.kind,
      entityKey: applied.clientRecordId,
      payload,
      version: applied.version,
    });
    return {
      mutationId: mutation.mutationId,
      status: 'accepted',
      authoritative: {
        recordId: applied.clientRecordId,
        ...(deleting ? { deleted: true as const } : { record: applied.payload as Record<string, unknown> }),
        ...(incomingIsAiResult ? { aiResultGeneration } : {}),
        occurredAt: applied.occurredAt.toISOString(),
        version: applied.version,
        updatedAt: applied.updatedAt.toISOString(),
      },
    };
  }

  private async applyDocument(
    tx: Parameters<Parameters<typeof this.database.db.transaction>[0]>[0],
    userId: string,
    mutation: DocumentMutation,
  ): Promise<SyncPushResult> {
    if (mutation.payload.documentKey === VOCABULARY_DOCUMENT_KEY) {
      return this.applyVocabularyDocument(tx, userId, mutation);
    }
    const target = and(
      eq(userDocuments.userId, userId),
      eq(userDocuments.documentKey, mutation.payload.documentKey),
    );
    const [current] = await tx.select().from(userDocuments).where(target).limit(1);
    if (current && mutation.payload.version <= current.version) {
      return {
        mutationId: mutation.mutationId,
        status: 'conflict',
        authoritative: {
          documentKey: current.documentKey,
          document: current.payload as Record<string, unknown>,
          version: current.version,
          updatedAt: current.updatedAt.toISOString(),
        },
      };
    }
    const values = {
      userId,
      documentKey: mutation.payload.documentKey,
      payload: mutation.payload.document,
      version: mutation.payload.version,
      updatedAt: new Date(mutation.payload.updatedAt),
    };
    if (current) await tx.update(userDocuments).set(values).where(target);
    else await tx.insert(userDocuments).values(values);
    const payload = { ...mutation.payload, updatedAt: values.updatedAt.toISOString() };
    await tx.insert(syncChanges).values({
      userId,
      kind: mutation.kind,
      entityKey: mutation.payload.documentKey,
      payload,
      version: mutation.payload.version,
    });
    return { mutationId: mutation.mutationId, status: 'accepted', authoritative: payload };
  }

  private async applyVocabularyDocument(
    tx: Parameters<Parameters<typeof this.database.db.transaction>[0]>[0],
    userId: string,
    mutation: DocumentMutation,
  ): Promise<SyncPushResult> {
    const incoming = vocabularyDocumentSchema.safeParse(mutation.payload.document);
    if (!incoming.success) throw new BadRequestException('invalid_vocabulary_document');
    const target = and(
      eq(userDocuments.userId, userId),
      eq(userDocuments.documentKey, VOCABULARY_DOCUMENT_KEY),
    );
    const [current] = await tx.select().from(userDocuments).where(target).limit(1);
    const document = current
      ? mergeVocabularyDocuments(current.payload, incoming.data)
      : incoming.data;
    const version = current ? Math.max(current.version + 1, mutation.payload.version) : mutation.payload.version;
    const updatedAt = new Date(document.updatedAt);
    const values = {
      userId,
      documentKey: VOCABULARY_DOCUMENT_KEY,
      payload: document,
      version,
      updatedAt,
    };
    if (current) await tx.update(userDocuments).set(values).where(target);
    else await tx.insert(userDocuments).values(values);
    const payload = {
      documentKey: VOCABULARY_DOCUMENT_KEY,
      document,
      version,
      updatedAt: updatedAt.toISOString(),
    };
    await tx.insert(syncChanges).values({
      userId,
      kind: mutation.kind,
      entityKey: VOCABULARY_DOCUMENT_KEY,
      payload,
      version,
    });
    return {
      mutationId: mutation.mutationId,
      status: current && mutation.payload.version <= current.version ? 'conflict' : 'accepted',
      authoritative: payload,
    };
  }

  async pull(userId: string, rawCursor?: string, ownerUserId?: string): Promise<SyncPullResponse> {
    if (ownerUserId && ownerUserId !== userId) throw new ConflictException('sync_user_mismatch');
    const cursor = rawCursor === undefined ? 0 : Number(rawCursor);
    if (!Number.isSafeInteger(cursor) || cursor < 0) throw new BadRequestException('invalid_sync_cursor');
    return this.database.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`learning:${userId}`}, 0))`);
      const limit = 200;
      const [account] = await tx.select({
        aiResultGeneration: accounts.aiResultGeneration,
        dataGeneration: accounts.learningDataGeneration,
      }).from(accounts).where(eq(accounts.id, userId)).limit(1);
      if (!account) throw new ConflictException('sync_user_mismatch');
      const rows = await tx.select().from(syncChanges)
        .where(and(eq(syncChanges.userId, userId), gt(syncChanges.sequence, cursor)))
        .orderBy(asc(syncChanges.sequence))
        .limit(limit + 1);
      const page = rows.slice(0, limit);
      const changes: SyncChange[] = page.map((row) => ({
        cursor: row.sequence,
        kind: row.kind as SyncChange['kind'],
        entityKey: row.entityKey,
        payload: row.payload as Record<string, unknown>,
        version: row.version,
        changedAt: row.createdAt.toISOString(),
      }));
      return {
        changes,
        cursor: changes.at(-1)?.cursor ?? cursor,
        hasMore: rows.length > limit,
        dataGeneration: account.dataGeneration,
        aiResultGeneration: account.aiResultGeneration,
      };
    });
  }

  async deleteAiResult(userId: string, recordId: string): Promise<PrivacyDeletionResponse> {
    return this.database.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`learning:${userId}`}, 0))`);
      const [account] = await tx.select({
        aiResultGeneration: accounts.aiResultGeneration,
        dataGeneration: accounts.learningDataGeneration,
      }).from(accounts).where(eq(accounts.id, userId)).limit(1);
      if (!account) throw new ConflictException('sync_user_mismatch');
      const target = and(eq(learningRecords.userId, userId), eq(learningRecords.clientRecordId, recordId));
      const [record] = await tx.select().from(learningRecords).where(target).limit(1);
      if (!record || (record.payload as { recordType?: unknown }).recordType !== 'ai_result') {
        return { ...account, deletedCount: 0 };
      }
      if ((record.payload as { deleted?: unknown }).deleted === true) {
        return { ...account, deletedCount: 0 };
      }
      await this.writeAiResultTombstone(tx, userId, record, account.aiResultGeneration);
      return { ...account, deletedCount: 1 };
    });
  }

  async deleteAllAiResults(
    userId: string,
    request: DeleteAllAiResultsRequest,
  ): Promise<PrivacyDeletionResponse> {
    return this.withPrivacyDeletionReceipt(userId, 'delete_all_ai_results', request, async (tx) => {
      const [account] = await tx.update(accounts).set({
        aiResultGeneration: sql`${accounts.aiResultGeneration} + 1`,
        updatedAt: new Date(),
      }).where(eq(accounts.id, userId)).returning({
        aiResultGeneration: accounts.aiResultGeneration,
        dataGeneration: accounts.learningDataGeneration,
      });
      if (!account) throw new ConflictException('sync_user_mismatch');
      const records = await tx.select().from(learningRecords).where(and(
        eq(learningRecords.userId, userId),
        sql`${learningRecords.payload}->>'recordType' = 'ai_result'`,
        sql`coalesce(${learningRecords.payload}->>'deleted', 'false') <> 'true'`,
      ));
      for (const record of records) {
        await this.writeAiResultTombstone(tx, userId, record, account.aiResultGeneration);
      }
      return { ...account, deletedCount: records.length };
    });
  }

  async clearLearningData(
    userId: string,
    request: ClearLearningDataRequest,
  ): Promise<PrivacyDeletionResponse> {
    return this.withPrivacyDeletionReceipt(userId, 'clear_learning_data', request, async (tx) => {
      const [account] = await tx.update(accounts).set({
        learningDataGeneration: sql`${accounts.learningDataGeneration} + 1`,
        aiResultGeneration: sql`${accounts.aiResultGeneration} + 1`,
        updatedAt: new Date(),
      }).where(eq(accounts.id, userId)).returning({
        aiResultGeneration: accounts.aiResultGeneration,
        dataGeneration: accounts.learningDataGeneration,
      });
      if (!account) throw new ConflictException('sync_user_mismatch');
      const cards = await tx.delete(userCardStates)
        .where(eq(userCardStates.userId, userId)).returning({ userId: userCardStates.userId });
      const records = await tx.delete(learningRecords)
        .where(eq(learningRecords.userId, userId)).returning({ id: learningRecords.id });
      const documents = await tx.delete(userDocuments)
        .where(eq(userDocuments.userId, userId)).returning({ userId: userDocuments.userId });
      await tx.delete(syncMutations).where(eq(syncMutations.userId, userId));
      await tx.delete(syncChanges).where(eq(syncChanges.userId, userId));
      return { ...account, deletedCount: cards.length + records.length + documents.length };
    });
  }

  private async withPrivacyDeletionReceipt(
    userId: string,
    action: PrivacyAction,
    request: PrivacyActionRequest,
    operation: (
      tx: Parameters<Parameters<typeof this.database.db.transaction>[0]>[0],
    ) => Promise<PrivacyDeletionResponse>,
  ): Promise<PrivacyDeletionResponse> {
    const requestHash = hashPrivacyRequest(action, request);
    return this.database.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`learning:${userId}`}, 0))`);
      const target = and(
        eq(privacyActionReceipts.accountId, userId),
        eq(privacyActionReceipts.action, action),
        eq(privacyActionReceipts.idempotencyKey, request.idempotencyKey),
      );
      const [existing] = await tx.select().from(privacyActionReceipts).where(target).limit(1);
      if (existing) {
        if (existing.requestHash !== requestHash) throw new ConflictException('privacy_idempotency_conflict');
        const result = privacyDeletionResponseSchema.safeParse(existing.result);
        if (!result.success) throw new Error('privacy_idempotency_result_invalid');
        return result.data;
      }
      const result = await operation(tx);
      await tx.insert(privacyActionReceipts).values({
        accountId: userId,
        action,
        idempotencyKey: request.idempotencyKey,
        requestHash,
        result,
      });
      return result;
    });
  }

  async exportLearningData(userId: string): Promise<AccountDataExportResponse['learning']> {
    return this.database.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`learning:${userId}`}, 0))`);
      const [account] = await tx.select({
        aiResultGeneration: accounts.aiResultGeneration,
        dataGeneration: accounts.learningDataGeneration,
      }).from(accounts).where(eq(accounts.id, userId)).limit(1);
      if (!account) throw new ConflictException('sync_user_mismatch');
      const cardRows = await tx.select().from(userCardStates)
        .where(eq(userCardStates.userId, userId)).orderBy(asc(userCardStates.updatedAt));
      const recordRows = await tx.select().from(learningRecords).where(and(
        eq(learningRecords.userId, userId),
        sql`coalesce(${learningRecords.payload}->>'deleted', 'false') <> 'true'`,
      )).orderBy(asc(learningRecords.occurredAt));
      const documentRows = await tx.select().from(userDocuments)
        .where(eq(userDocuments.userId, userId)).orderBy(asc(userDocuments.documentKey));
      return {
        ...account,
        cardStates: cardRows.map((row) => ({
          bankId: row.bankId,
          topicId: row.topicId,
          cardId: row.cardId,
          state: row.state as SyncCardState,
          updatedAt: row.updatedAt.toISOString(),
        })),
        records: recordRows.map((row) => row.payload as Record<string, unknown>),
        documents: documentRows.map((row) => ({
          documentKey: row.documentKey,
          document: row.payload as Record<string, unknown>,
          updatedAt: row.updatedAt.toISOString(),
        })),
      };
    });
  }

  private async writeAiResultTombstone(
    tx: Parameters<Parameters<typeof this.database.db.transaction>[0]>[0],
    userId: string,
    record: typeof learningRecords.$inferSelect,
    aiResultGeneration: number,
  ) {
    const version = record.version + 1;
    const updatedAt = new Date();
    const authoritative = {
      recordId: record.clientRecordId,
      deleted: true as const,
      aiResultGeneration,
      occurredAt: record.occurredAt.toISOString(),
      version,
      updatedAt: updatedAt.toISOString(),
    };
    await tx.update(learningRecords).set({
      payload: { deleted: true },
      version,
      updatedAt,
    }).where(and(
      eq(learningRecords.userId, userId),
      eq(learningRecords.clientRecordId, record.clientRecordId),
    ));
    await tx.delete(syncChanges).where(and(
      eq(syncChanges.userId, userId),
      eq(syncChanges.kind, 'learning_record'),
      eq(syncChanges.entityKey, record.clientRecordId),
    ));
    const historicalMutations = await tx.select({ mutationId: syncMutations.mutationId })
      .from(syncMutations)
      .where(and(
        eq(syncMutations.userId, userId),
        eq(syncMutations.kind, 'learning_record'),
        sql`${syncMutations.result}->'authoritative'->>'recordId' = ${record.clientRecordId}`,
      ));
    for (const mutation of historicalMutations) {
      await tx.update(syncMutations).set({
        result: {
          mutationId: mutation.mutationId,
          status: 'conflict',
          authoritative,
        } satisfies SyncPushResult,
      }).where(and(
        eq(syncMutations.userId, userId),
        eq(syncMutations.mutationId, mutation.mutationId),
      ));
    }
    await tx.insert(syncChanges).values({
      userId,
      kind: 'learning_record',
      entityKey: record.clientRecordId,
      payload: authoritative,
      version,
    });
  }

  private async latestCursor(userId: string) {
    const [latest] = await this.database.db.select({ sequence: syncChanges.sequence }).from(syncChanges)
      .where(eq(syncChanges.userId, userId))
      .orderBy(desc(syncChanges.sequence))
      .limit(1);
    return latest?.sequence ?? 0;
  }
}
