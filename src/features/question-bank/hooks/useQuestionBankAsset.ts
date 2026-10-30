import { useCallback, useEffect, useState } from 'react';

import { resolveQuestionBankAsset, resolveRemoteQuestionBankAsset } from '../platform/resource-service';

type QuestionBankAssetState = {
  path?: string;
  uri?: string;
  resolving: boolean;
  error?: string;
};

export function useQuestionBankAsset(path?: string): { uri?: string; resolving: boolean; error?: string; retry(): void } {
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
      .catch((error: unknown) => {
        const code = (error as { code?: string })?.code;
        const message = code === 'offline_resource_missing' ? '该音频尚未下载'
          : code === 'offline_resource_outdated' ? '该音频需要联网更新'
          : code === 'offline_authorization_required' ? '请联网验证后继续学习'
          : code === 'offline_resource_unavailable' ? '本机资源不可用，请联网修复' : undefined;
        if (active) setState({ path, uri: local, resolving: false, error: message });
      });
    return () => { active = false; };
  }, [attempt, path]);

  const retry = useCallback(() => setAttempt((current) => current + 1), []);
  const currentState = state.path === path
    ? state
    : { path, uri: resolveQuestionBankAsset(path), resolving: Boolean(path) };
  return { error: currentState.error, uri: currentState.uri, resolving: currentState.resolving, retry };
}
