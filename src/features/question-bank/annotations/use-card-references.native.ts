import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { subscribeCommerceEntitlementChanges } from '@/features/native-commercial-testflight/commerce-entitlement-events';
import { subscribeNativeCommerceEnvironment } from '@/features/native-commercial-testflight/commerce-environment.native';
import { cardIdentityKey, referenceOwner, resolveCardReferences, type CardReference } from '../data/card-references.native';
import type { QuestionBankCardTarget } from './types';
const subscribe = (listener: () => void) => {
  const a = subscribeCommerceEntitlementChanges(listener); const b = subscribeNativeCommerceEnvironment(listener);
  return () => { a(); b(); };
};
export function useCardReferences(targets: readonly QuestionBankCardTarget[]) {
  const owner = useSyncExternalStore(subscribe, referenceOwner, referenceOwner);
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<{ key: string; values: Map<string, CardReference> }>();
  const identities = JSON.stringify(targets.map(t => ({ bankId: t.bankId, categoryId: t.categoryId, topicId: t.topicId, cardId: t.cardId })));
  const key = `${owner}:${identities}:${attempt}`;
  useEffect(() => {
    let active = true;
    const requested: QuestionBankCardTarget[] = JSON.parse(identities);
    void resolveCardReferences(requested, {
      isCurrent: () => active,
      onProgress: values => { if (active) setLoaded({ key, values }); },
    }).then(values => { if (active) setLoaded({ key, values }); }).catch(() => {
      if (active) setLoaded({ key, values: new Map(requested.map(t => [cardIdentityKey(t), { status: 'unavailable', message: '原题加载未完成，请重试。' }])) });
    });
    return () => { active = false; };
  }, [identities, key]);
  const retry = useCallback(() => setAttempt(n => n + 1), []);
  return { values: loaded?.key === key ? loaded.values : undefined, retry };
}
