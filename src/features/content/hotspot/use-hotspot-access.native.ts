import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { getCommerceEntitlementSnapshot } from '@/features/native-commercial-testflight/commerce-entitlement-events';

import {
  hotspotAccessInvalidationSnapshot,
  subscribeHotspotAccessInvalidation,
} from './access-invalidation.native';
import { loadHotspotAccess } from './access-loader.native';
import type { HotspotAccessResult } from './access-state.native';
import { getHotspotBrief } from './repository';

type State = { status: 'loading' } | HotspotAccessResult;

function unexpectedHotspotAccessResult(briefId: string): HotspotAccessResult {
  try {
    const brief = getHotspotBrief(briefId);
    return brief ? { status: 'content-unavailable', brief } : { status: 'network-error' };
  } catch {
    return { status: 'network-error' };
  }
}

export function useHotspotAccess(briefId: string, { freezeReadyForStudy = false }: { freezeReadyForStudy?: boolean } = {}) {
  const environmentSnapshot = useSyncExternalStore(
    subscribeHotspotAccessInvalidation,
    hotspotAccessInvalidationSnapshot,
    hotspotAccessInvalidationSnapshot,
  );
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<State>({ status: 'loading' });
  const loadGeneration = useRef(0);
  const readyOwner = useRef<{ briefId: string; identity: string; attempt: number } | undefined>(undefined);
  const entitlement = getCommerceEntitlementSnapshot();
  const identity = `${entitlement?.accountId ?? ''}:${entitlement?.environment ?? ''}`;

  useEffect(() => {
    const ready = readyOwner.current;
    if (freezeReadyForStudy && ready?.briefId === briefId && ready.identity === identity && ready.attempt === attempt) return;
    readyOwner.current = undefined;
    const generation = loadGeneration.current + 1;
    loadGeneration.current = generation;
    setState({ status: 'loading' });
    void loadHotspotAccess(briefId)
      .then((result) => {
        if (loadGeneration.current === generation) {
          if (result.status === 'ready') readyOwner.current = { briefId, identity, attempt };
          setState(result);
        }
      })
      .catch(() => {
        if (loadGeneration.current === generation) {
          setState(unexpectedHotspotAccessResult(briefId));
        }
      });
    return () => {
      if (loadGeneration.current === generation) loadGeneration.current += 1;
    };
  }, [attempt, briefId, environmentSnapshot, freezeReadyForStudy, identity]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  return { retry, state };
}
