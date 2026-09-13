import { emitAudioDiagnostic } from '@/platform/audio/audio-diagnostics';

/** Serializes only native mutations; resource I/O must happen outside this lock. */
export class RadioOperationCoordinator {
  private tail: Promise<unknown> = Promise.resolve();

  run<T>(current: () => boolean, operation: () => Promise<T>): Promise<T | undefined> {
    const task = this.tail.catch(() => undefined).then(async () => {
      if (!current()) return undefined;
      return operation();
    });
    this.tail = task;
    return task;
  }
}

export function radioErrorMessage(error: unknown) {
  const value = error && typeof error === 'object' ? error as { code?: string; status?: number; message?: string } : {};
  if (value.status === 401 || value.status === 403) return '登录或学习权限已失效，请返回检查账号与会员状态';
  if (value.status === 404 || /decode|format|not.found|not_found/i.test(value.code ?? '')) return '这条音频暂时无法播放，请重试或切换下一首';
  if (/timed?.?out|timeout/i.test(`${value.code ?? ''} ${value.message ?? ''}`)) return '音频加载超时，请重试或切换下一首';
  if (/network|offline|connection/i.test(`${value.code ?? ''} ${value.message ?? ''}`)) return '网络连接不稳定，音频未能加载，请重试或切换下一首';
  return '播放遇到问题，请重试或切换下一首';
}

export function radioCanRetry(error: unknown) {
  const status = error && typeof error === 'object' && 'status' in error ? Number(error.status) : 0;
  return ![401, 403, 404, 409, 410].includes(status);
}

/** A stuck resolver cannot leave the player's loading state spinning forever. */
export async function withRadioTimeout<T>(task: Promise<T>, milliseconds = 15_000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      task,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(Object.assign(new Error('audio_load_timeout'), { code: 'timeout' })), milliseconds);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function reportRadioFailure(error: unknown, generation: number, phase: string) {
  const raw = error && typeof error === 'object' && 'code' in error ? String(error.code) : 'unknown';
  const code = /^[a-zA-Z0-9_.-]{1,80}$/.test(raw) ? raw : 'unknown';
  emitAudioDiagnostic({ scope: 'playback', owner: 'radio', code: 'radio_playback_failure',
    reason: code, phase, runtimeEpoch: generation, level: 'warning' });
}
