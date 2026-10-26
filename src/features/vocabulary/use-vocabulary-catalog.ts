import { useCallback, useEffect, useRef, useState } from 'react';
import { loadVocabulary, type VocabularyLoadResult } from './repository';

/** Screen-local presentation state; persistence and request sharing stay in the
 * existing catalog loader. Apply new content only outside an active session. */
export function useVocabularyCatalog(allowRefresh = true) {
  const [attempt, setAttempt] = useState(0);
  const [loadResult, setLoadResult] = useState<VocabularyLoadResult>();
  const [loadError, setLoadError] = useState(false);
  const initialized = useRef(false);
  const pendingUpdate = useRef<VocabularyLoadResult | undefined>(undefined);
  const canRefresh = useRef(allowRefresh);
  canRefresh.current = allowRefresh;
  const retry = useCallback(() => setAttempt(value => value + 1), []);

  useEffect(() => {
    let active = true;
    initialized.current = false;
    pendingUpdate.current = undefined;
    setLoadError(false);
    void loadVocabulary({ preferCache: true, onRefresh: result => {
      if (!active) return;
      if (initialized.current && canRefresh.current) setLoadResult(result);
      else pendingUpdate.current = result;
    } }).then(result => {
      if (!active) return;
      initialized.current = true;
      setLoadResult(canRefresh.current && pendingUpdate.current ? pendingUpdate.current : result);
      if (canRefresh.current) pendingUpdate.current = undefined;
    }).catch(() => { if (active) setLoadError(true); });
    return () => { active = false; };
  }, [attempt]);

  useEffect(() => {
    if (initialized.current && allowRefresh && pendingUpdate.current) {
      setLoadResult(pendingUpdate.current);
      pendingUpdate.current = undefined;
    }
  }, [allowRefresh]);

  return { loadResult, loadError, retry };
}
