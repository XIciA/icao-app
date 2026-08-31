import { useCallback, useEffect, useState } from 'react';

import { loadHotspotAccess } from './access-loader';
import type { HotspotAccessResult } from './access-state';

type State = { status: 'loading' } | HotspotAccessResult;

export function useHotspotAccess(briefId: string) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    let active = true;
    setState({ status: 'loading' });
    void loadHotspotAccess(briefId).then((result) => {
      if (active) setState(result);
    });
    return () => { active = false; };
  }, [attempt, briefId]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  return { retry, state };
}
