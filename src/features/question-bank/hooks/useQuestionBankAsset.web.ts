import { useCallback, useEffect, useState } from 'react';

import { isEdgeOneProductionWeb } from '@/config/web-runtime';

import { resolveQuestionBankAsset, resolveRemoteQuestionBankAsset } from '../platform/resource-service';

/**
 * Web deploys a checksum-verified same-origin copy of the current Vercel
 * release, so resolving a card resource does not require an API or IndexedDB
 * round trip.
 */
export function useQuestionBankAsset(path?: string) {
  const production = isEdgeOneProductionWeb();
  const local = resolveQuestionBankAsset(path);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState({ path, resolving: production && Boolean(path), uri: local });

  useEffect(() => {
    let active = true;
    if (!production) {
      setState({ path, resolving: false, uri: local });
      return () => { active = false; };
    }
    if (!path) {
      setState({ path, resolving: false, uri: undefined });
      return () => { active = false; };
    }
    setState({ path, resolving: true, uri: local });
    void resolveRemoteQuestionBankAsset(path, { forceRefresh: attempt > 0 })
      .then((remote) => {
        if (active) setState({ path, resolving: false, uri: remote ?? local });
      })
      .catch(() => {
        if (active) setState({ path, resolving: false, uri: local });
      });
    return () => { active = false; };
  }, [attempt, local, path, production]);

  const retry = useCallback(() => {
    if (production) setAttempt((current) => current + 1);
  }, [production]);
  const current = state.path === path ? state : { path, resolving: production && Boolean(path), uri: local };
  return {
    uri: production ? current.uri : local,
    resolving: production ? current.resolving : false,
    retry,
  };
}
