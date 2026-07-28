import { useCallback } from 'react';

import { resolveQuestionBankAsset } from '../platform/resource-service';

/**
 * Web content and assets are immutable Vercel releases, so resolving a card
 * resource does not require an API or IndexedDB round trip.
 */
export function useQuestionBankAsset(path?: string) {
  const retry = useCallback(() => undefined, []);
  return {
    uri: resolveQuestionBankAsset(path),
    resolving: false,
    retry,
  };
}
