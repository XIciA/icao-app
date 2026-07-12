import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import type {
  CardStateMutation,
  DocumentMutation,
  LearningRecordMutation,
  SyncChange,
  SyncMutation,
  SyncPullResponse,
  SyncPushRequest,
  SyncPushResponse,
  SyncPushResult,
} from '@icao/contracts';
import { createHash } from 'node:crypto';
import { and, asc, desc, eq, gt } from 'drizzle-orm';
import { z } from 'zod';

import { DatabaseService } from '../database/database.service';
import { learningRecords, profiles, syncChanges, syncMutations, userCardStates, userDocuments } from '../database/schema';

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
    record: z.record(z.string(), z.unknown()),
    occurredAt: z.string().datetime(),
  }),
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
  mutations: z.array(z.discriminatedUnion('kind', [cardMutationSchema, recordMutationSchema, documentMutationSchema])).max(100),
});

function hashMutation(mutation: SyncMutation) {
  return createHash('sha256').update(JSON.stringify(mutation)).digest('hex');
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

    const results = await this.database.db.transaction(async (tx) => {
      await tx.insert(profiles).values({ userId }).onConflictDoNothing();
      const output: SyncPushResult[] = [];
      for (const mutation of parsed.data.mutations as SyncMutation[]) {
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
            ? await this.applyLearningRecord(tx, userId, mutation)
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
      return output;
    });

    return { results, cursor: await this.latestCursor(userId) };
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
  ): Promise<SyncPushResult> {
    const inserted = await tx.insert(learningRecords).values({
      userId,
      clientRecordId: mutation.payload.recordId,
      payload: mutation.payload.record,
      occurredAt: new Date(mutation.payload.occurredAt),
    }).onConflictDoNothing().returning({ id: learningRecords.id });
    if (inserted.length === 0) return { mutationId: mutation.mutationId, status: 'duplicate' };
    await tx.insert(syncChanges).values({
      userId,
      kind: mutation.kind,
      entityKey: mutation.payload.recordId,
      payload: mutation.payload,
      version: 1,
    });
    return { mutationId: mutation.mutationId, status: 'accepted' };
  }

  private async applyDocument(
    tx: Parameters<Parameters<typeof this.database.db.transaction>[0]>[0],
    userId: string,
    mutation: DocumentMutation,
  ): Promise<SyncPushResult> {
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

  async pull(userId: string, rawCursor?: string): Promise<SyncPullResponse> {
    const cursor = rawCursor === undefined ? 0 : Number(rawCursor);
    if (!Number.isSafeInteger(cursor) || cursor < 0) throw new BadRequestException('invalid_sync_cursor');
    const limit = 200;
    const rows = await this.database.db.select().from(syncChanges)
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
    };
  }

  private async latestCursor(userId: string) {
    const [latest] = await this.database.db.select({ sequence: syncChanges.sequence }).from(syncChanges)
      .where(eq(syncChanges.userId, userId))
      .orderBy(desc(syncChanges.sequence))
      .limit(1);
    return latest?.sequence ?? 0;
  }
}
