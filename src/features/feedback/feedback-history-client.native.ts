import type { MyFeedbackDetail, MyFeedbackList } from '@icao/contracts/feedback-ops';
import { apiRequest } from '@/platform/api-client';
import { getNativeCommerceEnvironmentState, subscribeNativeCommerceEnvironment } from '@/features/native-commercial-testflight/commerce-environment.native';

export async function feedbackRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const owner = getNativeCommerceEnvironmentState();
  const controller = new AbortController();
  const assertOwner = () => {
    const current = getNativeCommerceEnvironmentState();
    if (!owner.accountId || current.accountId !== owner.accountId || current.generation !== owner.generation || current.status !== 'active') throw new Error('request_aborted');
  };
  const abort = () => controller.abort();
  init.signal?.addEventListener('abort', abort, { once: true });
  if (init.signal?.aborted) abort();
  const unsubscribe = subscribeNativeCommerceEnvironment(() => { try { assertOwner(); } catch { abort(); } });
  try {
    assertOwner();
    const result = await apiRequest<T>(`/v1/feedback${path}`, { ...init, signal: controller.signal });
    assertOwner();
    if (controller.signal.aborted) throw new Error('request_aborted');
    return result;
  } finally { unsubscribe(); init.signal?.removeEventListener('abort', abort); }
}
export const listMyFeedback = (cursor?: string, signal?: AbortSignal) => feedbackRequest<MyFeedbackList>(cursor ? `?cursor=${encodeURIComponent(cursor)}` : '', { signal });
export const getMyFeedback = (number: string, signal?: AbortSignal) => feedbackRequest<MyFeedbackDetail>(`/${encodeURIComponent(number)}`, { signal });
export const markFeedbackRead = (number: string, replyId: string, signal?: AbortSignal) => feedbackRequest(`/${encodeURIComponent(number)}/read`, {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ replyId }), signal,
});

export const unreadFeedback = () => feedbackRequest<{unread:boolean}>('/unread');
