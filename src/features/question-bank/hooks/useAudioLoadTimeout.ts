import { useCallback, useEffect, useState } from 'react';

export const AUDIO_LOAD_TIMEOUT_MS = 12_000;

export function useAudioLoadTimeout({
  sourceKey,
  uri,
  isLoaded,
  hasError,
  timeoutMs = AUDIO_LOAD_TIMEOUT_MS,
}: {
  sourceKey: string;
  uri?: string;
  isLoaded: boolean;
  hasError: boolean;
  timeoutMs?: number;
}) {
  const [attempt, setAttempt] = useState(0);
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    setTimedOut(false);
    if (!uri || isLoaded || hasError) return;
    const timeout = setTimeout(() => setTimedOut(true), timeoutMs);
    return () => clearTimeout(timeout);
  }, [attempt, hasError, isLoaded, sourceKey, timeoutMs, uri]);

  const retry = useCallback(() => {
    setTimedOut(false);
    setAttempt((current) => current + 1);
  }, []);

  return { timedOut, retry };
}
