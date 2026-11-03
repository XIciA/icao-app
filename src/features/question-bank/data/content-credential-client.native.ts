import { COMMERCE_ENVIRONMENT_HEADER, type ContentAccessCredential, type ContentAccessScope } from '@icao/contracts';
import { getConnectivity } from '../platform/network-service';
import { ApiClientError, apiRequest } from '@/platform/api-client';
import { commerceContentAccessSnapshot } from '@/features/native-commercial-testflight/commerce-entitlement-events';
import { getNativeCommerceEnvironment, nativeCommerceEnvironmentSnapshot } from '@/features/native-commercial-testflight/commerce-environment';
import { currentQuestionBankContentAccountId, questionBankContentAccountGeneration, readReusableContentCredential } from './member-content-cache.native';
import { verifyContentAccessCredential } from './content-credential-verifier.native';

type Scope = ContentAccessScope & { version?: number };
type Request = { scope: Scope; priority: number; promise: Promise<ContentAccessCredential>; resolve(value: ContentAccessCredential): void; reject(error: unknown): void; consumers: (() => boolean)[] };
type Context = ReturnType<typeof context>;
type Owner = { context: Context; pending: Map<string, Request>; cached: Map<string, ContentAccessCredential>; timer?: ReturnType<typeof setTimeout>; running: boolean; retryAt: number };
let owner: Owner | undefined;
const identity = (scope: Scope) => JSON.stringify([scope.bankId, scope.categoryId, scope.topicId, scope.version]);
function context() {
  return { accountId: currentQuestionBankContentAccountId(), generation: questionBankContentAccountGeneration(),
    environment: getNativeCommerceEnvironment(), environmentSnapshot: nativeCommerceEnvironmentSnapshot(), access: commerceContentAccessSnapshot() };
}
function current(value: Context) { return JSON.stringify(value) === JSON.stringify(context()); }
function assertCurrent(value: Context, isCurrent: () => boolean) {
  if (!current(value)) throw new ApiClientError('content_account_changed', 409);
  if (!isCurrent()) throw new ApiClientError('content_request_cancelled', 409);
}
function limited(state: Owner) {
  return new ApiClientError('content_credential_rate_limited', 429, undefined, Math.max(1, Math.ceil((state.retryAt - Date.now()) / 1000)));
}
function schedule(state: Owner) {
  if (state.running || state.timer) return;
  // Coalesce simultaneous topic reads, download batches and credential renewal.
  state.timer = setTimeout(() => { state.timer = undefined; void drain(state); }, 20);
}
async function drain(state: Owner) {
  if (state.running) return;
  state.running = true;
  try {
    while (state.pending.size) {
      // The API accepts each topic only once per batch, even if two callers
      // are checking different release versions of that topic.
      const topics = new Set<string>();
      const batch = [...state.pending.entries()].sort((a, b) => a[1].priority - b[1].priority).filter(([, request]) => {
        const topic = identity({ ...request.scope, version: undefined });
        if (topics.has(topic)) return false;
        topics.add(topic); return true;
      }).slice(0, 24);
      const live = batch.filter(([, request]) => request.consumers.some(valid => valid()));
      const settle = (error: unknown) => { for (const [key, request] of batch) { state.pending.delete(key); request.reject(error); } };
      try {
        assertCurrent(state.context, () => true);
        if (state.retryAt > Date.now()) throw limited(state);
        if (live.length && await getConnectivity() === 'offline') throw new ApiClientError('network_failed', 0);
        assertCurrent(state.context, () => true);
        const credential = live.length ? await apiRequest<ContentAccessCredential>('/v1/content-access/credentials', {
          method: 'POST', headers: { [COMMERCE_ENVIRONMENT_HEADER]: state.context.environment, 'content-type': 'application/json' },
          body: JSON.stringify({ validity: 'membership', scopes: live.map(([, request]) => request.scope) }),
        }) : undefined;
        assertCurrent(state.context, () => true);
        if (credential && live.some(([, request]) => !verifyContentAccessCredential({ accountId: state.context.accountId!, environment: state.context.environment, scope: request.scope, credential }))) {
          throw new Error('invalid_content_credential');
        }
        for (const [key, request] of batch) {
          state.pending.delete(key);
          if (!credential || !live.some(([, item]) => item === request)) request.reject(new ApiClientError('content_request_cancelled', 409));
          else {
            state.cached.set(key, credential);
            if (state.cached.size > 1024) state.cached.delete(state.cached.keys().next().value!);
            request.resolve(credential);
          }
        }
      } catch (error) {
        if ((error as { status?: number })?.status === 429) {
          const seconds = (error as { retryAfterSeconds?: number }).retryAfterSeconds;
          state.retryAt = Date.now() + (Number.isFinite(seconds) && seconds! > 0 ? Math.min(seconds!, 900) : 60) * 1000;
        }
        settle(error);
      }
    }
  } finally { state.running = false; }
}

/** The one request owner for online topic caching, radio and downloads. Each
 * returned credential corresponds to the scope at the same index. */
export async function requestContentCredentials(scopes: Scope[], { forceRefresh = false, background = false, isCurrent = () => true }: {
  forceRefresh?: boolean; background?: boolean; isCurrent?: () => boolean;
} = {}): Promise<ContentAccessCredential[]> {
  const snapshot = context();
  assertCurrent(snapshot, isCurrent);
  if (!snapshot.accountId) throw new ApiClientError('unauthorized', 401);
  if (!owner || !current(owner.context)) owner = { context: snapshot, pending: new Map(), cached: new Map(), running: false, retryAt: 0 };
  const state = owner;
  return Promise.all(scopes.map(async scope => {
    const key = identity(scope);
    const reusable = () => {
      const cached = state.cached.get(key);
      return cached && (!forceRefresh || Date.now() - Date.parse(cached.issuedAt) < 60_000)
        && verifyContentAccessCredential({ accountId: snapshot.accountId!, environment: snapshot.environment, credential: cached, scope }) ? cached : undefined;
    };
    const cached = reusable();
    if (cached) return cached;
    if (!forceRefresh) {
      const saved = await readReusableContentCredential(scope).catch(() => undefined);
      assertCurrent(snapshot, isCurrent);
      if (saved) { state.cached.set(key, saved); return saved; }
      const issuedWhileReading = reusable();
      if (issuedWhileReading) return issuedWhileReading;
    }
    if (state.retryAt > Date.now()) throw limited(state);
    let request = state.pending.get(key);
    if (!request) {
      let resolve!: Request['resolve']; let reject!: Request['reject'];
      const promise = new Promise<ContentAccessCredential>((done, fail) => { resolve = done; reject = fail; });
      request = { scope, promise, resolve, reject, consumers: [], priority: background ? 1 : 0 };
      state.pending.set(key, request);
    }
    request.priority = Math.min(request.priority, background ? 1 : 0);
    request.consumers.push(isCurrent);
    schedule(state);
    const result = await request.promise;
    assertCurrent(snapshot, isCurrent);
    return result;
  }));
}
