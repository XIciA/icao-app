import { useCallback, useEffect, useState } from 'react';

import { resolveQuestionBankAsset, resolveRemoteQuestionBankAsset } from '../platform/resource-service';

type QuestionBankAssetState = {
  path?: string;
  uri?: string;
  resolving: boolean;
};

export function useQuestionBankAsset(path?: string) {
  const [state, setState] = useState<QuestionBankAssetState>({
    path,
    uri: resolveQuestionBankAsset(path),
    resolving: Boolean(path),
  });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    const local = resolveQuestionBankAsset(path);
    setState({ path, uri: local, resolving: Boolean(path) });
    if (!path) {
      setState({ path, uri: undefined, resolving: false });
      return () => { active = false; };
    }
    void resolveRemoteQuestionBankAsset(path, { forceRefresh: attempt > 0 })
      .then((remote) => {
        if (active) setState({ path, uri: remote ?? local, resolving: false });
      })
      .catch(() => {
        if (active) setState({ path, uri: local, resolving: false });
      });
    return () => { active = false; };
  }, [attempt, path]);

  const retry = useCallback(() => setAttempt((current) => current + 1), []);
  const currentState = state.path === path
    ? state
    : { path, uri: resolveQuestionBankAsset(path), resolving: Boolean(path) };
  return { uri: currentState.uri, resolving: currentState.resolving, retry };
}
