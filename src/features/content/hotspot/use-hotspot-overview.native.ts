import { useEffect, useState } from 'react';
import type { AppContentHotspotOverview } from '@icao/contracts/app-content';
import { apiRequest } from '@/platform/api-client';
import { getHotspotBrief } from './repository.native';
import type { HotspotAccessResult } from './access-state.native';

type State = { status: 'loading' } | ({ status: 'ready' } & AppContentHotspotOverview)
  | Exclude<HotspotAccessResult, { status: 'ready' }>;

/** Overview never requests a topic or constructs a protected study package. */
export function useHotspotOverview(briefId: string) {
  const [state, setState] = useState<State>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let current = true;
    setState({ status: 'loading' });
    void apiRequest<AppContentHotspotOverview>(`/v1/app-content/hotspots/${encodeURIComponent(briefId)}/overview`)
      .then(result => { if (current) setState({ ...result, status: 'ready' }); })
      .catch(() => { if (current) setState({ status: 'network-error', brief: getHotspotBrief(briefId) }); });
    return () => { current = false; };
  }, [briefId, attempt]);
  return { state, retry: () => setAttempt(value => value + 1) };
}
