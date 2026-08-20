import type {
  FeedbackDiagnosticBundle,
  FeedbackDiagnosticEvent,
  FeedbackDiagnosticFeature,
} from '@icao/contracts';

import Storage from '@/platform/storage';

const STORAGE_KEY = 'icao.safe-diagnostics.v1';
const MAX_STORED_EVENTS = 50;
const MAX_SUBMITTED_EVENTS = 30;
const RETENTION_MILLISECONDS = 24 * 60 * 60 * 1_000;
const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9:_-]{0,159}$/u;
const SAFE_STAGE_OR_CODE = /^[a-z][a-z0-9_]{0,119}$/u;

type StoredSafeDiagnostic = {
  recordedAt: number;
  feature: FeedbackDiagnosticFeature;
  correlationId: string;
  event: Omit<FeedbackDiagnosticEvent, 'offsetMs'>;
};

export type SafeDiagnosticEventInput = Omit<FeedbackDiagnosticEvent, 'offsetMs'> & {
  feature: FeedbackDiagnosticFeature;
  correlationId: string;
};

export type SafeDiagnosticBundleContext = Pick<
  FeedbackDiagnosticBundle,
  'appVersion' | 'build' | 'platform' | 'osVersion'
>;

let writeQueue = Promise.resolve();

function safeInteger(value: unknown, minimum: number, maximum: number) {
  return typeof value === 'number' && Number.isInteger(value) && value >= minimum && value <= maximum
    ? value
    : undefined;
}

function safeBoolean(value: unknown) {
  return typeof value === 'boolean' ? value : undefined;
}

function safeEnum<T extends string>(value: unknown, values: readonly T[]) {
  return typeof value === 'string' && values.includes(value as T) ? value as T : undefined;
}

function safeIdentifier(value: unknown) {
  return typeof value === 'string' && SAFE_IDENTIFIER.test(value) ? value : undefined;
}

function safeStageOrCode(value: unknown) {
  return typeof value === 'string' && SAFE_STAGE_OR_CODE.test(value) ? value : undefined;
}

function sanitizeEvent(input: SafeDiagnosticEventInput): StoredSafeDiagnostic | undefined {
  const feature = safeEnum(input.feature, ['recording', 'ai'] as const);
  const correlationId = safeIdentifier(input.correlationId);
  const stage = safeStageOrCode(input.stage);
  const code = safeStageOrCode(input.code);
  const level = safeEnum(input.level, ['info', 'warning', 'error'] as const);
  if (!feature || !correlationId || !stage || !code || !level) return undefined;

  return {
    recordedAt: Date.now(),
    feature,
    correlationId,
    event: {
      stage,
      code,
      level,
      durationMs: safeInteger(input.durationMs, 0, 24 * 60 * 60 * 1_000),
      byteSize: safeInteger(input.byteSize, 0, 2_147_483_647),
      format: safeEnum(input.format, ['m4a', 'wav', 'unknown'] as const),
      owner: safeEnum(input.owner, ['radio', 'study', 'recording', 'recordingPlayback'] as const),
      recorderState: safeEnum(input.recorderState, ['idle', 'prepared', 'preparing', 'recording', 'stopping', 'unknown'] as const),
      meteringDetected: safeBoolean(input.meteringDetected),
      mediaServicesDidReset: safeBoolean(input.mediaServicesDidReset),
      canRecord: safeBoolean(input.canRecord),
      isRecording: safeBoolean(input.isRecording),
      capability: safeEnum(input.capability, ['transcribe', 'grammar', 'polish'] as const),
      requestId: safeIdentifier(input.requestId),
      retryable: safeBoolean(input.retryable),
      httpStatus: safeInteger(input.httpStatus, 100, 599),
      attempt: safeInteger(input.attempt, 1, 10),
    },
  };
}

function parseStoredDiagnostic(value: unknown): StoredSafeDiagnostic | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const item = value as Partial<StoredSafeDiagnostic>;
  if (typeof item.recordedAt !== 'number' || !Number.isFinite(item.recordedAt)) return undefined;
  if (!item.event || typeof item.event !== 'object') return undefined;
  const sanitized = sanitizeEvent({
    ...(item.event as Omit<FeedbackDiagnosticEvent, 'offsetMs'>),
    feature: item.feature as FeedbackDiagnosticFeature,
    correlationId: item.correlationId ?? '',
  });
  return sanitized ? { ...sanitized, recordedAt: item.recordedAt } : undefined;
}

async function readRecent(now = Date.now()) {
  const raw = await Storage.getItem(STORAGE_KEY).catch(() => null);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(parseStoredDiagnostic)
      .filter((item): item is StoredSafeDiagnostic => item !== undefined)
      .filter((item) => now - item.recordedAt >= 0 && now - item.recordedAt <= RETENTION_MILLISECONDS)
      .slice(-MAX_STORED_EVENTS);
  } catch {
    return [];
  }
}

async function write(events: StoredSafeDiagnostic[]) {
  if (events.length === 0) await Storage.removeItem(STORAGE_KEY);
  else await Storage.setItem(STORAGE_KEY, JSON.stringify(events.slice(-MAX_STORED_EVENTS)));
}

function afterPendingWrites<T>(operation: () => Promise<T>) {
  return writeQueue.catch(() => undefined).then(operation);
}

export function recordSafeDiagnosticEvent(input: SafeDiagnosticEventInput) {
  const event = sanitizeEvent(input);
  if (!event) return Promise.resolve(false);
  const operation = afterPendingWrites(async () => {
    const events = await readRecent(event.recordedAt);
    events.push(event);
    await write(events);
    return true;
  });
  writeQueue = operation.then(() => undefined, () => undefined);
  return operation.catch(() => false);
}

export function getSafeDiagnosticBundleForCorrelation(
  context: SafeDiagnosticBundleContext,
  feature: FeedbackDiagnosticFeature,
  correlationId: string,
) {
  if (!safeEnum(feature, ['recording', 'ai'] as const) || !safeIdentifier(correlationId)) {
    return Promise.resolve(undefined);
  }
  const operation = afterPendingWrites(async (): Promise<FeedbackDiagnosticBundle | undefined> => {
    const now = Date.now();
    const events = await readRecent(now);
    await write(events);
    const correlated = events
      .filter((item) => item.feature === feature && item.correlationId === correlationId)
      .slice(-MAX_SUBMITTED_EVENTS);
    if (correlated.length === 0 || !correlated.some((item) => item.event.level === 'error')) return undefined;
    const startedAt = correlated[0].recordedAt;
    return {
      schemaVersion: 1,
      feature,
      correlationId,
      appVersion: context.appVersion,
      build: context.build,
      platform: context.platform,
      osVersion: context.osVersion,
      events: correlated.map((item) => ({
        ...item.event,
        offsetMs: Math.max(0, item.recordedAt - startedAt),
      })),
    };
  });
  writeQueue = operation.then(() => undefined, () => undefined);
  return operation.catch(() => undefined);
}

export function purgeExpiredSafeDiagnostics(now = Date.now()) {
  const operation = afterPendingWrites(async () => {
    const events = await readRecent(now);
    await write(events);
  });
  writeQueue = operation.then(() => undefined, () => undefined);
  return operation.catch(() => undefined);
}

export function clearSafeDiagnosticCorrelation(feature: FeedbackDiagnosticFeature, correlationId: string) {
  if (!safeEnum(feature, ['recording', 'ai'] as const) || !safeIdentifier(correlationId)) return Promise.resolve();
  const operation = afterPendingWrites(async () => {
    const events = await readRecent();
    await write(events.filter((item) => item.feature !== feature || item.correlationId !== correlationId));
  });
  writeQueue = operation.then(() => undefined, () => undefined);
  return operation.catch(() => undefined);
}

export async function resetSafeDiagnosticStoreForTests() {
  await writeQueue.catch(() => undefined);
  await Storage.removeItem(STORAGE_KEY).catch(() => undefined);
  writeQueue = Promise.resolve();
}
