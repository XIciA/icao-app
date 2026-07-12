import { useCallback, useEffect, useState } from 'react';

import { resolveQuestionBankAsset, resolveRemoteQuestionBankAsset } from '../platform/resource-service';

export function useQuestionBankAsset(path?: string) {
  const [state, setState] = useState<{ uri?: string; resolving: boolean }>({ uri: resolveQuestionBankAsset(path), resolving: Boolean(path) });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    const local = resolveQuestionBankAsset(path);
    setState({ uri: local, resolving: Boolean(path) });
    if (!path) {
      setState({ uri: undefined, resolving: false });
      return () => { active = false; };
    }
    void resolveRemoteQuestionBankAsset(path, { forceRefresh: attempt > 0 })
      .then((remote) => {
        if (active) setState({ uri: remote ?? local, resolving: false });
      })
      .catch(() => {
        if (active) setState({ uri: local, resolving: false });
      });
    return () => { active = false; };
  }, [attempt, path]);

  const retry = useCallback(() => setAttempt((current) => current + 1), []);
  return { ...state, retry };
}
