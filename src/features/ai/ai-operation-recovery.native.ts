import type { AiOperationLookup } from '@icao/contracts/commerce-rules';
import { getNativeCommerceEnvironmentState } from '@/features/native-commercial-testflight/commerce-environment.native';
import { assertLearningWriteContext, captureLearningWriteContext, enqueueLearningRecord, runLearningSync, type LearningWriteContext } from '@/features/sync/learning-sync.native';
import { sqliteLearningStore } from '@/features/question-bank/platform/learning-store.native';
import { getLearningRecords, loadLearningAiRecord, updatePendingLearningAiRecord } from '@/features/question-bank/platform/learning-record-storage.native';
import type { LearningRecord } from '@/features/question-bank/types';
import { lookupAiOperation } from './ai-client.native';

type Operation = NonNullable<LearningRecord['aiOperation']>;
type Completed = Extract<AiOperationLookup, { state: 'completed' }>;
export async function savePendingAiOperation(record: Omit<LearningRecord, 'updatedAt'>, operationId: string, context: LearningWriteContext, inputTranscript?: string) {
  assertLearningWriteContext(context, true);
  const owner = getNativeCommerceEnvironmentState();
  if (!owner.accountId || owner.status !== 'active') throw new Error('commerce_environment_unavailable');
  const operation: Operation = { operationId, environment: owner.environment, status: 'pending', inputTranscript };
  await sqliteLearningStore.addRecord({ ...record, aiOperation: operation, updatedAt: new Date().toISOString() }, context);
  assertLearningWriteContext(context, true);
  return operation;
}

function applyResult(record: LearningRecord, result: Completed['result']): LearningRecord {
  const previous = record.aiResult!;
  const transcript = 'transcript' in result && typeof result.transcript === 'string' ? result.transcript : undefined;
  const review = 'review' in result ? result.review : 'grammar' in result ? result : undefined;
  return { ...record, aiOperation: { ...record.aiOperation!, status: 'complete' }, updatedAt: new Date().toISOString(),
    feedbackCount: review ? 1 : record.feedbackCount,
    aiResult: { ...previous,
      // A recovery never overwrites a later manually edited answer.
      ...(transcript !== undefined ? { rawTranscript: transcript } : {}),
      ...(review ? { analyzedTranscript: transcript ?? record.aiOperation?.inputTranscript ?? previous.transcript,
        grammar: { correctedText: review.grammar.correctedText, issues: review.grammar.issues }, polishedText: review.polishedText } : {}),
    },
  };
}

export async function completePendingAiOperation(recordId: string, operationId: string, result: Completed['result'], context: LearningWriteContext) {
  assertLearningWriteContext(context, true);
  const saved = await updatePendingLearningAiRecord(recordId, operationId, (record) => applyResult(record, result), () => assertLearningWriteContext(context, true));
  if (saved) await enqueueLearningRecord(saved, context);
  if (saved) return saved;
  // A foreground recovery may already have saved this exact operation.
  const current = await loadLearningAiRecord(recordId);
  assertLearningWriteContext(context, true);
  return current?.aiOperation?.operationId === operationId && current.aiOperation.status === 'complete' ? current : undefined;
}

export async function abandonPendingAiOperation(recordId: string, operationId: string, context: LearningWriteContext) {
  const saved = await updatePendingLearningAiRecord(recordId, operationId,
    (record) => ({ ...record, aiOperation: { ...record.aiOperation!, status: 'complete' }, updatedAt: new Date().toISOString() }), () => assertLearningWriteContext(context, true));
  if (saved) await enqueueLearningRecord(saved, context);
}

let running: Promise<void> | undefined;
let runningOwner: string | undefined;
/** Startup/foreground/navigation only; reuse the existing sync before interpreting deletion markers. */
export function recoverPendingAiOperations(): Promise<void> {
  const owner = getNativeCommerceEnvironmentState();
  if (!owner.accountId || owner.status !== 'active') return Promise.resolve();
  const ownerKey = `${owner.accountId}:${owner.environment}:${owner.generation}`;
  if (running) return runningOwner === ownerKey ? running : running.catch(() => undefined).then(recoverPendingAiOperations);
  const userId = owner.accountId;
  const assertOwner = () => {
    const current = getNativeCommerceEnvironmentState();
    if (current.accountId !== userId || current.environment !== owner.environment || current.generation !== owner.generation || current.status !== 'active') throw new Error('learning_owner_or_generation_changed');
  };
  const action = async () => {
    const rows = await getLearningRecords();
    assertOwner();
    if (!rows.some((record) => record.recordType === 'ai_result' && record.aiOperation?.status === 'pending' && record.aiOperation.environment === owner.environment)) return;
    const status = await runLearningSync(userId);
    assertOwner();
    if (status.boundUserId !== userId || status.lastError) return;
    const context = captureLearningWriteContext();
    const candidates = (await getLearningRecords()).filter((record) => record.recordType === 'ai_result'
      && record.aiOperation?.status === 'pending' && record.aiOperation.environment === owner.environment);
    for (const candidate of candidates) {
      assertOwner(); assertLearningWriteContext(context, true);
      const record = await loadLearningAiRecord(candidate.id);
      if (!record?.aiOperation || record.aiOperation.operationId !== candidate.aiOperation!.operationId || record.aiOperation.status !== 'pending') continue;
      const result = await lookupAiOperation(record.aiOperation.operationId);
      assertOwner(); assertLearningWriteContext(context, true);
      if (result.state === 'completed') await completePendingAiOperation(record.id, record.aiOperation.operationId, result.result, context);
      else if (result.state === 'released') await abandonPendingAiOperation(record.id, record.aiOperation.operationId, context);
    }
  };
  const promise = action().finally(() => { if (running === promise) running = undefined; });
  running = promise;
  runningOwner = ownerKey;
  return promise;
}
