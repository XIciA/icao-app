import { ApiClientError } from '@/platform/api-client';

import type { HotspotSessionResult } from './build-hotspot-session';
import type { OpiHotspotBrief, ResolvedOpiHotspotTopic } from './types';

type HotspotAccessFailureBase = {
  brief: OpiHotspotBrief;
  requestId?: string;
};

export type HotspotAccessResult =
  | {
    status: 'ready';
    brief: OpiHotspotBrief;
    topics: ResolvedOpiHotspotTopic[];
    session: HotspotSessionResult;
  }
  | (HotspotAccessFailureBase & { status: 'membership-required' })
  | (HotspotAccessFailureBase & { status: 'offline-authorization-expired' })
  | { status: 'not-found'; brief?: undefined; requestId?: string }
  | (HotspotAccessFailureBase & { status: 'network-error' })
  | (HotspotAccessFailureBase & { status: 'content-unavailable' });

const SAFE_REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{1,80}$/u;

export function safeHotspotRequestId(error: unknown) {
  const requestId = error instanceof ApiClientError ? error.requestId : undefined;
  return requestId && SAFE_REQUEST_ID_PATTERN.test(requestId) ? requestId : undefined;
}

export function isHotspotNetworkFailure(error: unknown) {
  if (error instanceof ApiClientError) {
    return error.status === 408
      || error.code === 'network_error'
      || error.code === 'network_unavailable'
      || error.code === 'request_timeout';
  }
  if (error instanceof TypeError) return true;
  return error instanceof Error && error.name === 'AbortError';
}

export function classifyHotspotFailure(
  brief: OpiHotspotBrief,
  error: unknown,
): Exclude<HotspotAccessResult, { status: 'ready' } | { status: 'not-found' }> {
  const requestId = safeHotspotRequestId(error);
  if (error instanceof ApiClientError && error.code === 'membership_required') {
    return { status: 'membership-required', brief, requestId };
  }
  if (isHotspotNetworkFailure(error)) return { status: 'network-error', brief, requestId };
  return { status: 'content-unavailable', brief, requestId };
}
