import { useCallback } from 'react';

import { resolveQuestionBankAsset } from '../platform/resource-service';

/**
 * Web deploys a checksum-verified same-origin copy of the current Vercel
 * release, so resolving a card resource does not require an API or IndexedDB
 * round trip.
 */
export function useQuestionBankAsset(path?: string) {
  const retry = useCallback(() => undefined, []);
  return {
    uri: resolveQuestionBankAsset(path),
    resolving: false,
    retry,
  };
}
