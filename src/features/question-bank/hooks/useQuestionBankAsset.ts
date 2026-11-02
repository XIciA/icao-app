import { useCallback, useEffect, useRef, useState } from 'react';

import { useConnectivity } from '../platform/use-connectivity';
import { resolveQuestionBankAsset, resolveRemoteQuestionBankAsset } from '../platform/resource-service';

type QuestionBankAssetState = {
  path?: string;
  uri?: string;
  resolving: boolean;
  error?: string;
  unavailable?: boolean;
};

export function useQuestionBankAsset(path?: string): { uri?: string; resolving: boolean; error?: string; unavailable?: boolean; retry(): void } {
  const connectivity = useConnectivity();
  const [state, setState] = useState<QuestionBankAssetState>({
    path,
    uri: resolveQuestionBankAsset(path),
    resolving: Boolean(path),
  });
  const [attempt, setAttempt] = useState(0);
  const previousConnectivity = useRef(connectivity);
  useEffect(() => {
    const recovered = previousConnectivity.current === 'offline' && connectivity === 'online';
    previousConnectivity.current = connectivity;
    // A healthy local player must survive connectivity changes without replacing
    // its source or resetting playback. Only retry an unavailable resource.
    if (recovered && state.unavailable) setAttempt(value => value + 1);
  }, [connectivity, state.unavailable]);

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
        const message = code === 'offline_resource_missing' ? '音频未下载，联网后可播放'
          : code === 'offline_resource_outdated' ? '音频需联网更新'
          : code === 'offline_authorization_required' ? '请联网验证会员'
          : code === 'offline_resource_unavailable' ? '音频需联网修复' : undefined;
        if (active) setState({ path, uri: message ? undefined : local, resolving: false, error: message, unavailable: Boolean(message) });
      });
    return () => { active = false; };
  }, [attempt, path]);

  const retry = useCallback(() => setAttempt((current) => current + 1), []);
  const currentState = state.path === path
    ? state
    : { path, uri: resolveQuestionBankAsset(path), resolving: Boolean(path) };
  return { unavailable: currentState.unavailable, error: currentState.error, uri: currentState.uri, resolving: currentState.resolving, retry };
}
