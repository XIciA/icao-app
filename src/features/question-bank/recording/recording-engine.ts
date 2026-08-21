import {
  emitAudioDiagnostic,
  type AudioLease,
  type AudioSessionError,
} from '@/platform/audio';

import { RecordingRepositoryError } from './recording-repository-error';
import type {
  RawRecording,
  RecorderPort,
  RecorderRuntimeEvent,
  RecordingAsset,
  RecordingFailure,
  RecordingFailureCode,
  RecordingOperationContext,
} from './types';

export type RecordingEnginePhase =
  | 'idle'
  | 'requestingPermission'
  | 'preparing'
  | 'recording'
  | 'finalizing'
  | 'ready'
  | 'error';

export type RecordingEngineSnapshot = {
  asset?: RecordingAsset;
  compatibilityVisible: boolean;
  durationMillis: number;
  error?: RecordingFailure;
  interactionActive: boolean;
  permissionPrimerActive: boolean;
  permissionPrimerRequired: boolean;
  permissionPrimerWaiting: boolean;
  phase: RecordingEnginePhase;
  replacing: boolean;
  runtimeEpoch: number;
  runtimeTainted: boolean;
};

type RecordingRepositoryPort = {
  commitRaw(input: RawRecording & {
    cardId: string;
    diagnosticId?: string;
    operationDurationMs: number;
    sessionId: string;
  }): Promise<RecordingAsset>;
  discard(asset: RecordingAsset): void;
  discardRaw(raw?: RawRecording): void;
};

type AudioSessionPort = {
  acquire(owner: 'recording', reason: string): Promise<AudioLease>;
  getActiveOwner?(): string | undefined;
  release(lease: AudioLease): Promise<void>;
};

type SchedulerPort = {
  clearInterval(handle: ReturnType<typeof setInterval>): void;
  clearTimeout(handle: ReturnType<typeof setTimeout>): void;
  setInterval(callback: () => void, milliseconds: number): ReturnType<typeof setInterval>;
  setTimeout(callback: () => void, milliseconds: number): ReturnType<typeof setTimeout>;
};

type RecordingEngineConfig = {
  cardId: string;
  onClear: () => void;
  onRecorded: (asset: RecordingAsset) => void;
  recording?: RecordingAsset;
  sessionId: string;
};

export type RecordingEngineDependencies = {
  audioSession: AudioSessionPort;
  config: RecordingEngineConfig;
  now?: () => number;
  repository: RecordingRepositoryPort;
  scheduler?: SchedulerPort;
};

type ActiveOperation = RecordingOperationContext & {
  cancelled: boolean;
  cardId: string;
  diagnosticId: string;
  failureAfterCleanup?: RecordingFailureCode;
  lease?: AudioLease;
  onRecorded: (asset: RecordingAsset) => void;
  prepareAttempted: boolean;
  releaseRequested: boolean;
  runtime: RecorderPort;
  started: boolean;
  startedAt?: number;
  stopRequested: boolean;
  sessionId: string;
  timedOut: boolean;
};

const PREPARE_TIMEOUT_MS = 3_000;
const START_TIMEOUT_MS = 2_000;
const STOP_TIMEOUT_MS = 5_000;
const MIN_DURATION_MS = 400;
const MAX_DURATION_MS = 180_000;
const WEB_PERMISSION_WAIT_MS = 10_000;
const DURATION_TICK_MS = 100;

const WEB_COMPATIBILITY_FAILURES = new Set<RecordingFailureCode>([
  'record_prepare_failed',
  'record_start_failed',
  'record_stop_failed',
  'recording_file_incomplete',
  'recording_finalization_timeout',
]);

const FAILURE_MESSAGES: Record<RecordingFailureCode, string> = {
  microphone_device_missing: '没有检测到可用麦克风。',
  microphone_device_unavailable: '麦克风暂时不可用。',
  microphone_permission_denied: '需要麦克风权限才能录音。',
  record_prepare_failed: '录音准备失败，请稍后重试。',
  record_start_failed: '录音启动失败，请稍后重试。',
  record_stop_failed: '录音停止失败，请重新录制。',
  recording_asset_missing: '本地录音已失效，请重新录制。',
  recording_audio_mode_failed: '录音音频模式切换失败，请稍后重试。',
  recording_audio_mode_timeout: '录音音频模式切换超时，请稍后重试。',
  recording_browser_unsupported: '当前浏览器暂不支持网页录音。',
  recording_commit_failed: '录音保存失败，请重新录制。',
  recording_container_invalid: '录音文件格式无效，请重新录制。',
  recording_file_incomplete: '没有生成有效录音文件，请重新录制。',
  recording_finalization_timeout: '录音保存等待超时，请重新录制。',
  recording_interrupted: '录音已中断，请保持页面在前台后重试。',
  recording_media_duration_mismatch: '录音文件的实际时长异常，请重新录制。',
  recording_media_unreadable: '录音文件无法读取，请重新录制。',
  recording_media_services_reset: '系统音频服务已重置，请重新录制。',
  recording_native_prepare_failed: 'iPhone 录音器准备失败，请稍后重试。',
  recording_native_prepare_timeout: 'iPhone 录音器准备超时，请重新录制。',
  recording_native_start_failed: 'iPhone 录音器启动失败，请稍后重试。',
  recording_native_start_timeout: 'iPhone 录音器启动超时，请重新录制。',
  recording_owner_pause_failed: '上一段音频未能暂停，请稍后重试。',
  recording_owner_pause_timeout: '上一段音频暂停超时，请稍后重试。',
  recording_runtime_tainted: '系统录音器没有返回；正在隔离旧录音器。如仍无法重试，请重新启动 App。',
  recording_source_missing: '没有找到录音文件，请重新录制。',
  recording_stop_timeout: 'iPhone 录音器停止超时，请重新启动 App 后重试。',
  recording_too_short: '录音时间太短，请重新录制。',
};

class RecordingEngineError extends Error {
  constructor(readonly code: RecordingFailureCode) {
    super(code);
    this.name = 'RecordingEngineError';
  }
}

let diagnosticSequence = 0;

function diagnosticId() {
  diagnosticSequence = (diagnosticSequence + 1) % 1_296;
  return `R-${Date.now().toString(36).slice(-5).toUpperCase()}-${diagnosticSequence.toString(36).padStart(2, '0').toUpperCase()}`;
}

function defaultNow() {
  return globalThis.performance?.now?.() ?? Date.now();
}

function durationsAgree(leftMs: number, rightMs: number) {
  const tolerance = Math.max(500, Math.max(leftMs, rightMs) * 0.2);
  return Math.abs(leftMs - rightMs) <= tolerance;
}

const defaultScheduler: SchedulerPort = {
  clearInterval: (handle) => clearInterval(handle),
  clearTimeout: (handle) => clearTimeout(handle),
  setInterval: (callback, milliseconds) => setInterval(callback, milliseconds),
  setTimeout: (callback, milliseconds) => setTimeout(callback, milliseconds),
};

function isFailureCode(value: unknown): value is RecordingFailureCode {
  return typeof value === 'string' && value in FAILURE_MESSAGES;
}

function codeForError(
  error: unknown,
  fallback: RecordingFailureCode,
): RecordingFailureCode {
  if (error instanceof RecordingRepositoryError || error instanceof RecordingEngineError) return error.code;
  const candidate = (error as AudioSessionError | { code?: unknown } | undefined)?.code
    ?? (error instanceof Error ? error.message : undefined);
  if (isFailureCode(candidate)) return candidate;
  if (candidate === 'mode_switch_failed') return 'recording_audio_mode_failed';
  if (candidate === 'mode_switch_timeout') return 'recording_audio_mode_timeout';
  if (candidate === 'owner_pause_failed') return 'recording_owner_pause_failed';
  if (candidate === 'owner_pause_timeout') return 'recording_owner_pause_timeout';
  return fallback;
}

function diagnosticReasonForError(error: unknown) {
  const reason = (error as { diagnosticReason?: unknown } | undefined)?.diagnosticReason;
  if (reason === 'audio-session-configuration'
    || reason === 'native-recorder-prepare'
    || reason === 'unknown-native-prepare') return reason;
  return undefined;
}

function isSameContext(
  context: RecordingOperationContext | undefined,
  operation: ActiveOperation,
) {
  return !context || (
    context.operationId === operation.operationId
    && context.runtimeEpoch === operation.runtimeEpoch
  );
}

export class RecordingEngine {
  private readonly audioSession: AudioSessionPort;
  private readonly listeners = new Set<() => void>();
  private readonly now: () => number;
  private readonly repository: RecordingRepositoryPort;
  private readonly scheduler: SchedulerPort;
  private activeOperation?: ActiveOperation;
  private config: RecordingEngineConfig;
  private durationTimer?: ReturnType<typeof setInterval>;
  private maximumTimer?: ReturnType<typeof setTimeout>;
  private nextOperationId = 1;
  private permissionOperationId = 0;
  private permissionPromise: Promise<void> | null = null;
  private permissionWaitTimer?: ReturnType<typeof setTimeout>;
  private runtime?: RecorderPort;
  private runtimeUnsubscribe?: () => void;
  private startPromise: Promise<void> | null = null;
  private stopPromise: Promise<void> | null = null;
  private compatibilityFailure?: { code: RecordingFailureCode; count: number };
  private state: RecordingEngineSnapshot;

  constructor(dependencies: RecordingEngineDependencies) {
    this.audioSession = dependencies.audioSession;
    this.config = dependencies.config;
    this.now = dependencies.now ?? defaultNow;
    this.repository = dependencies.repository;
    this.scheduler = dependencies.scheduler ?? defaultScheduler;
    this.state = {
      asset: dependencies.config.recording,
      compatibilityVisible: false,
      durationMillis: 0,
      interactionActive: false,
      permissionPrimerActive: false,
      permissionPrimerRequired: false,
      permissionPrimerWaiting: false,
      phase: dependencies.config.recording ? 'ready' : 'idle',
      replacing: false,
      runtimeEpoch: 0,
      runtimeTainted: false,
    };
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = () => this.state;

  configure(config: RecordingEngineConfig) {
    this.config = config;
    if (!this.activeOperation && !this.permissionPromise && config.recording !== this.state.asset) {
      this.update({
        asset: config.recording,
        error: undefined,
        phase: config.recording ? 'ready' : 'idle',
        replacing: false,
      });
    }
  }

  attachRuntime(runtime: RecorderPort, runtimeEpoch: number) {
    if (runtimeEpoch !== this.state.runtimeEpoch) return () => undefined;
    this.runtimeUnsubscribe?.();
    this.runtime = runtime;
    this.runtimeUnsubscribe = runtime.subscribe((event) => this.handleRuntimeEvent(runtime, runtimeEpoch, event));
    this.update({
      permissionPrimerRequired: runtime.isWeb && runtime.permissionReady !== true,
    });
    return () => {
      if (this.runtime === runtime) {
        this.runtimeUnsubscribe?.();
        this.runtimeUnsubscribe = undefined;
        this.runtime = undefined;
      }
    };
  }

  pressIn = () => {
    if (this.state.runtimeTainted || this.permissionPromise || this.startPromise || this.stopPromise) return;
    const runtime = this.runtime;
    if (!runtime) return;
    if (runtime.isWeb && runtime.permissionReady !== true && this.state.permissionPrimerRequired) {
      void this.primePermission();
      return;
    }
    const operation: ActiveOperation = {
      cancelled: false,
      cardId: this.config.cardId,
      diagnosticId: diagnosticId(),
      operationId: this.nextOperationId++,
      onRecorded: this.config.onRecorded,
      prepareAttempted: false,
      releaseRequested: false,
      runtime,
      runtimeEpoch: this.state.runtimeEpoch,
      sessionId: this.config.sessionId,
      started: false,
      stopRequested: false,
      timedOut: false,
    };
    this.activeOperation = operation;
    const promise = this.runStart(operation).finally(() => {
      if (this.startPromise === promise) this.startPromise = null;
    });
    this.startPromise = promise;
  };

  pressOut = async () => {
    const operation = this.activeOperation;
    if (!operation) return;
    operation.releaseRequested = true;
    await this.startPromise?.catch(() => undefined);
    if (this.activeOperation === operation && operation.started && !operation.stopRequested) {
      await this.stopOperation(operation, true);
    }
  };

  beginReplacement = () => {
    if (!this.state.asset || this.state.interactionActive) return;
    this.update({ error: undefined, phase: 'idle', replacing: true });
  };

  cancelReplacement = () => {
    if (this.state.interactionActive) return;
    this.update({
      error: undefined,
      phase: this.state.asset ? 'ready' : 'idle',
      replacing: false,
    });
  };

  clear = () => {
    if (this.state.interactionActive) return;
    this.config.onClear();
    this.update({ asset: undefined, error: undefined, phase: 'idle', replacing: false });
  };

  dismissCompatibility = () => this.update({ compatibilityVisible: false });

  retryPermission = async () => {
    const runtime = this.runtime;
    if (runtime?.isWeb) return this.primePermission();
    if (!runtime) return;
    try {
      const granted = await runtime.requestPermission();
      if (granted) this.update({ error: undefined, phase: this.state.asset ? 'ready' : 'idle' });
      else this.fail('microphone_permission_denied');
    } catch (error) {
      this.fail(codeForError(error, 'microphone_device_unavailable'));
    }
  };

  primePermission = () => {
    const runtime = this.runtime;
    if (!runtime?.isWeb) return Promise.resolve();
    if (this.permissionPromise) return this.permissionPromise;
    if (runtime.permissionReady) {
      this.update({ permissionPrimerRequired: false });
      return Promise.resolve();
    }
    const permissionOperationId = ++this.permissionOperationId;
    this.update({
      error: undefined,
      permissionPrimerActive: true,
      permissionPrimerWaiting: false,
      phase: 'requestingPermission',
    });
    this.clearPermissionTimer();
    this.permissionWaitTimer = this.scheduler.setTimeout(() => {
      if (permissionOperationId === this.permissionOperationId) this.update({ permissionPrimerWaiting: true });
    }, WEB_PERMISSION_WAIT_MS);
    const promise = (async () => {
      try {
        const granted = runtime.primePermission
          ? await runtime.primePermission()
          : await runtime.requestPermission();
        if (permissionOperationId !== this.permissionOperationId) return;
        if (!granted) {
          this.fail('microphone_permission_denied');
          return;
        }
        this.compatibilityFailure = undefined;
        this.update({
          error: undefined,
          permissionPrimerRequired: false,
          phase: this.state.asset && !this.state.replacing ? 'ready' : 'idle',
        });
      } catch (error) {
        if (permissionOperationId !== this.permissionOperationId) return;
        this.fail(codeForError(error, 'microphone_device_unavailable'));
      } finally {
        if (permissionOperationId === this.permissionOperationId) {
          this.clearPermissionTimer();
          this.update({ permissionPrimerActive: false, permissionPrimerWaiting: false });
        }
      }
    })().finally(() => {
      if (this.permissionPromise === promise) this.permissionPromise = null;
    });
    this.permissionPromise = promise;
    return promise;
  };

  cancelPermissionPrimer = async () => {
    ++this.permissionOperationId;
    this.clearPermissionTimer();
    this.permissionPromise = null;
    this.update({
      permissionPrimerActive: false,
      permissionPrimerWaiting: false,
      phase: this.state.asset ? 'ready' : 'idle',
    });
  };

  interrupt = async () => {
    const operation = this.activeOperation;
    if (!operation) {
      if (this.permissionPromise || this.state.permissionPrimerActive) await this.cancelPermissionPrimer();
      return;
    }
    operation.cancelled = true;
    operation.failureAfterCleanup = 'recording_interrupted';
    operation.releaseRequested = true;
    this.update({ phase: 'finalizing' });
    await this.startPromise?.catch(() => undefined);
    if (this.activeOperation !== operation || operation.timedOut) return;
    if (operation.started) await this.stopOperation(operation, false, operation.failureAfterCleanup);
    else {
      await this.cleanupOperation(operation);
      this.finishOperation(operation);
      this.fail('recording_interrupted', operation.diagnosticId, operation);
    }
  };

  destroy() {
    void this.interrupt();
    this.runtimeUnsubscribe?.();
    this.runtimeUnsubscribe = undefined;
    this.stopDurationTimers();
    this.clearPermissionTimer();
    this.listeners.clear();
  }

  private async runStart(operation: ActiveOperation) {
    this.update({
      durationMillis: 0,
      error: undefined,
      phase: 'requestingPermission',
      replacing: this.state.replacing || Boolean(this.state.asset),
    });
    this.report('record_start_requested', 'permission', operation, 'info');
    let fallback: RecordingFailureCode = 'microphone_device_unavailable';
    try {
      const granted = await operation.runtime.requestPermission();
      if (!this.isCurrent(operation) || operation.releaseRequested) {
        await this.cleanupOperation(operation);
        this.finishOperation(operation);
        return;
      }
      if (!granted) throw new RecordingEngineError('microphone_permission_denied');
      this.update({ permissionPrimerRequired: false, phase: 'preparing' });
      fallback = 'recording_audio_mode_failed';
      operation.lease = await this.audioSession.acquire('recording', 'recording-start');
      if (!this.isCurrent(operation) || operation.releaseRequested) {
        await this.cleanupOperation(operation);
        this.finishOperation(operation);
        return;
      }
      fallback = operation.runtime.isWeb ? 'record_prepare_failed' : 'recording_native_prepare_failed';
      operation.prepareAttempted = true;
      const preparePromise = operation.runtime.prepare(operation);
      await this.withTimeout(
        preparePromise,
        PREPARE_TIMEOUT_MS,
        operation.runtime.isWeb ? 'record_prepare_failed' : 'recording_native_prepare_timeout',
        operation,
        async () => this.cleanupOperation(operation),
      );
      if (!this.isCurrent(operation) || operation.releaseRequested) {
        await this.cleanupOperation(operation);
        this.rebuildPreparedRuntime(operation);
        return;
      }
      operation.startedAt = this.now();
      fallback = operation.runtime.isWeb ? 'record_start_failed' : 'recording_native_start_failed';
      const startPromise = operation.runtime.start(operation);
      await this.withTimeout(
        startPromise,
        START_TIMEOUT_MS,
        operation.runtime.isWeb ? 'record_start_failed' : 'recording_native_start_timeout',
        operation,
        async () => this.cleanupOperation(operation),
      );
      operation.started = true;
      if (!this.isCurrent(operation) || operation.releaseRequested) {
        await this.stopOperation(operation, false);
        return;
      }
      this.update({ phase: 'recording' });
      this.startDurationTimers(operation);
      this.report('recording_started', 'recording', operation, 'info');
    } catch (error) {
      const code = codeForError(error, fallback);
      if (!operation.timedOut) {
        await this.cleanupOperation(operation);
        this.rebuildPreparedRuntime(operation);
      } else {
        this.finishOperation(operation);
      }
      this.fail(code, operation.diagnosticId, operation, diagnosticReasonForError(error));
    }
  }

  private stopOperation(
    operation: ActiveOperation,
    commit: boolean,
    failureAfterCleanup?: RecordingFailureCode,
  ) {
    if (this.stopPromise) return this.stopPromise;
    operation.stopRequested = true;
    this.stopDurationTimers();
    this.update({ phase: 'finalizing' });
    const promise = this.runStop(operation, commit, failureAfterCleanup).finally(() => {
      if (this.stopPromise === promise) this.stopPromise = null;
    });
    this.stopPromise = promise;
    return promise;
  }

  private async runStop(
    operation: ActiveOperation,
    commit: boolean,
    failureAfterCleanup?: RecordingFailureCode,
  ) {
    let raw: RawRecording | undefined;
    try {
      const stopPromise = operation.runtime.stop(operation);
      raw = await this.withTimeout(
        stopPromise,
        STOP_TIMEOUT_MS,
        operation.runtime.isWeb ? 'recording_finalization_timeout' : 'recording_stop_timeout',
        operation,
        async (lateRaw) => {
          this.repository.discardRaw(lateRaw);
          await this.releaseLease(operation);
        },
      );
      const operationDurationMs = Math.max(0, this.now() - (operation.startedAt ?? this.now()));
      if (raw.recorderDurationMs && !durationsAgree(raw.recorderDurationMs, operationDurationMs)) {
        this.report('duration_contract_mismatch', 'duration', operation, 'warning', operationDurationMs);
      }
      await this.releaseLease(operation);
      if (!commit || operation.cancelled || !this.isCurrent(operation)) {
        this.repository.discardRaw(raw);
        this.finishOperation(operation);
        const cleanupFailure = failureAfterCleanup ?? operation.failureAfterCleanup;
        if (cleanupFailure) this.fail(cleanupFailure, operation.diagnosticId, operation);
        return;
      }
      if (operationDurationMs < MIN_DURATION_MS) {
        this.repository.discardRaw(raw);
        throw new RecordingEngineError('recording_too_short');
      }
      const repositoryOwnedRaw = raw;
      raw = undefined;
      const asset = await this.repository.commitRaw({
        ...repositoryOwnedRaw,
        cardId: operation.cardId,
        diagnosticId: operation.diagnosticId,
        operationDurationMs,
        sessionId: operation.sessionId,
      });
      raw = undefined;
      if (!this.isCurrent(operation) || operation.cancelled) {
        this.repository.discard(asset);
        this.finishOperation(operation);
        const cleanupFailure = failureAfterCleanup ?? operation.failureAfterCleanup;
        if (cleanupFailure) this.fail(cleanupFailure, operation.diagnosticId, operation);
        return;
      }
      try {
        operation.onRecorded(asset);
      } catch {
        this.repository.discard(asset);
        throw new RecordingEngineError('recording_commit_failed');
      }
      this.compatibilityFailure = undefined;
      this.finishOperation(operation);
      this.update({
        asset,
        compatibilityVisible: false,
        durationMillis: asset.durationMillis,
        error: undefined,
        permissionPrimerRequired: operation.runtime.isWeb ? false : this.state.permissionPrimerRequired,
        phase: 'ready',
        replacing: false,
      });
      this.report('recording_committed', 'commit', operation, 'info', asset.durationMillis, asset.byteSize);
    } catch (error) {
      const code = failureAfterCleanup
        ?? operation.failureAfterCleanup
        ?? codeForError(error, 'record_stop_failed');
      if (raw) this.repository.discardRaw(raw);
      if (!operation.timedOut) {
        const cancelled = await operation.runtime.cancel(operation).catch(() => undefined);
        if (cancelled) this.repository.discardRaw(cancelled);
        await this.releaseLease(operation);
      }
      this.finishOperation(operation);
      this.fail(code, operation.diagnosticId, operation);
    }
  }

  private withTimeout<T>(
    source: Promise<T>,
    milliseconds: number,
    timeoutCode: RecordingFailureCode,
    operation: ActiveOperation,
    lateCleanup: (value: T) => Promise<void>,
  ) {
    const settlement = Promise.resolve(source);
    return new Promise<T>((resolve, reject) => {
      let settled = false;
      const timer = this.scheduler.setTimeout(() => {
        if (settled) return;
        settled = true;
        operation.timedOut = true;
        this.markRuntimeTainted(operation);
        void settlement.then(
          async (value) => lateCleanup(value),
          async () => this.cleanupOperation(operation),
        ).finally(() => this.rebuildRuntime(operation));
        reject(new RecordingEngineError(timeoutCode));
      }, milliseconds);
      settlement.then(
        (value) => {
          if (settled) return;
          settled = true;
          this.scheduler.clearTimeout(timer);
          resolve(value);
        },
        (error) => {
          if (settled) return;
          settled = true;
          this.scheduler.clearTimeout(timer);
          reject(error);
        },
      );
    });
  }

  private markRuntimeTainted(operation: ActiveOperation) {
    operation.cancelled = true;
    this.stopDurationTimers();
    this.update({ runtimeTainted: true });
    this.report('recording_runtime_tainted', 'runtime', operation, 'error');
  }

  private rebuildRuntime(operation: ActiveOperation) {
    if (operation.runtimeEpoch !== this.state.runtimeEpoch) return;
    this.runtimeUnsubscribe?.();
    this.runtimeUnsubscribe = undefined;
    this.runtime = undefined;
    this.finishOperation(operation);
    this.update({
      error: undefined,
      phase: this.state.asset ? 'ready' : 'idle',
      runtimeEpoch: this.state.runtimeEpoch + 1,
      runtimeTainted: false,
    });
  }

  private rebuildPreparedRuntime(operation: ActiveOperation) {
    if (operation.prepareAttempted) this.rebuildRuntime(operation);
    else this.finishOperation(operation);
  }

  private async cleanupOperation(operation: ActiveOperation) {
    const raw = await operation.runtime.cancel(operation).catch(() => undefined);
    if (raw) this.repository.discardRaw(raw);
    await this.releaseLease(operation);
  }

  private async releaseLease(operation: ActiveOperation) {
    const lease = operation.lease;
    operation.lease = undefined;
    if (!lease) return;
    try {
      await this.audioSession.release(lease);
    } catch {
      this.report('recording_audio_mode_failed', 'lease_release', operation, 'error');
    }
  }

  private finishOperation(operation: ActiveOperation) {
    if (this.activeOperation === operation) this.activeOperation = undefined;
    this.stopDurationTimers();
    if (this.state.phase === 'finalizing' || this.state.phase === 'preparing' || this.state.phase === 'requestingPermission') {
      this.update({
        durationMillis: 0,
        phase: this.state.asset ? 'ready' : 'idle',
        replacing: false,
      });
    }
  }

  private startDurationTimers(operation: ActiveOperation) {
    this.stopDurationTimers();
    this.durationTimer = this.scheduler.setInterval(() => {
      if (!this.isCurrent(operation) || operation.startedAt === undefined) return;
      this.update({ durationMillis: Math.max(0, this.now() - operation.startedAt) });
    }, DURATION_TICK_MS);
    this.maximumTimer = this.scheduler.setTimeout(() => {
      if (this.isCurrent(operation) && !operation.stopRequested) void this.stopOperation(operation, true);
    }, MAX_DURATION_MS);
  }

  private stopDurationTimers() {
    if (this.durationTimer) this.scheduler.clearInterval(this.durationTimer);
    if (this.maximumTimer) this.scheduler.clearTimeout(this.maximumTimer);
    this.durationTimer = undefined;
    this.maximumTimer = undefined;
  }

  private clearPermissionTimer() {
    if (this.permissionWaitTimer) this.scheduler.clearTimeout(this.permissionWaitTimer);
    this.permissionWaitTimer = undefined;
  }

  private handleRuntimeEvent(
    runtime: RecorderPort,
    runtimeEpoch: number,
    event: RecorderRuntimeEvent,
  ) {
    const operation = this.activeOperation;
    if (!operation || operation.runtime !== runtime || operation.runtimeEpoch !== runtimeEpoch) return;
    if (!isSameContext(event.context, operation) || operation.stopRequested || operation.timedOut) return;
    if (event.type === 'status') return;
    if (event.type === 'error') {
      operation.cancelled = true;
      void this.interruptWithCode(operation, event.code ?? 'recording_interrupted');
      return;
    }
    operation.cancelled = true;
    void this.interruptWithCode(
      operation,
      event.type === 'interrupted' && event.reason === 'media-services-reset'
        ? 'recording_media_services_reset'
        : 'recording_interrupted',
    );
  }

  private async interruptWithCode(operation: ActiveOperation, code: RecordingFailureCode) {
    operation.releaseRequested = true;
    operation.failureAfterCleanup = code;
    this.update({ phase: 'finalizing' });
    await this.startPromise?.catch(() => undefined);
    if (!this.isCurrent(operation) || operation.timedOut) return;
    if (operation.started) await this.stopOperation(operation, false, code);
    else {
      await this.cleanupOperation(operation);
      this.finishOperation(operation);
      this.fail(code, operation.diagnosticId, operation);
    }
  }

  private fail(
    code: RecordingFailureCode,
    operationDiagnosticId?: string,
    failedOperation?: ActiveOperation,
    diagnosticReason?: string,
  ) {
    const runtime = this.runtime ?? this.activeOperation?.runtime ?? failedOperation?.runtime;
    if (runtime?.isWeb) {
      if (code === 'recording_browser_unsupported') {
        this.compatibilityFailure = undefined;
        this.update({ compatibilityVisible: true });
      } else if (WEB_COMPATIBILITY_FAILURES.has(code)) {
        const count = this.compatibilityFailure?.code === code ? this.compatibilityFailure.count + 1 : 1;
        this.compatibilityFailure = { code, count };
        if (count >= 2) this.update({ compatibilityVisible: true });
      } else {
        this.compatibilityFailure = undefined;
      }
      if ([
        'microphone_device_missing',
        'microphone_device_unavailable',
        'microphone_permission_denied',
        'recording_browser_unsupported',
      ].includes(code)) this.update({ permissionPrimerRequired: true });
    }
    const error = { code, diagnosticId: operationDiagnosticId, message: FAILURE_MESSAGES[code] };
    this.update({
      error,
      phase: this.state.asset ? 'ready' : 'error',
      replacing: false,
    });
    const operation = failedOperation ?? this.activeOperation;
    if (operation) this.report(code, 'recording', operation, 'error', undefined, undefined, diagnosticReason);
  }

  private report(
    code: string,
    stage: string,
    operation: ActiveOperation,
    level: 'info' | 'warning' | 'error',
    durationMs?: number,
    byteSize?: number,
    reason?: string,
  ) {
    emitAudioDiagnostic({
      byteSize,
      code,
      diagnosticId: operation.diagnosticId,
      durationMillis: durationMs,
      level,
      owner: this.audioSession.getActiveOwner?.() as 'recording' | undefined,
      phase: stage,
      reason,
      runtimeEpoch: operation.runtimeEpoch,
      scope: 'recording',
    });
  }

  private isCurrent(operation: ActiveOperation) {
    return this.activeOperation === operation
      && operation.runtimeEpoch === this.state.runtimeEpoch;
  }

  private update(patch: Partial<RecordingEngineSnapshot>) {
    const phase = patch.phase ?? this.state.phase;
    const next = {
      ...this.state,
      ...patch,
      interactionActive: ['requestingPermission', 'preparing', 'recording', 'finalizing'].includes(phase),
    };
    if (Object.keys(patch).every((key) => Object.is(
      this.state[key as keyof RecordingEngineSnapshot],
      next[key as keyof RecordingEngineSnapshot],
    ))) return;
    this.state = next;
    this.listeners.forEach((listener) => listener());
  }
}
