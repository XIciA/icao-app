export type ProviderMeta = {
  attemptCount?: number;
  audioDurationSeconds?: number;
  inputTokens?: number;
  outputTokens?: number;
  upstreamStatus?: string;
  timings?: { stagingMs?: number; submitMs?: number; statusRequestMs?: number; pollingWaitMs?: number; cleanupMs?: number; queueMs?: number; generationMs?: number; totalMs?: number; pollCount?: number };
};
