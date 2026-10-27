import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { NavigationContext } from '@react-navigation/native';
import { getApiBaseUrl } from '@/platform/api-client';
import { loadVocabulary, type VocabularyLoadResult } from './repository';

/** Screen-local presentation state; persistence and request sharing stay in the
 * existing catalog loader. Apply new content only outside an active session. */
export function useVocabularyCatalog(allowRefresh = true) {
  const source = getApiBaseUrl() ?? '';
  const navigation = useContext(NavigationContext);
  const [attempt, setAttempt] = useState(0);
  const [loadResult, setLoadResult] = useState<VocabularyLoadResult>();
  const [loadError, setLoadError] = useState(false);
  const initialized = useRef(false);
  const loadedSource = useRef(source);
  const previousAllowRefresh = useRef(allowRefresh);
  const previousRefreshSource = useRef(source);
  const pendingUpdate = useRef<{ source: string; result: VocabularyLoadResult } | undefined>(undefined);
  const canRefresh = useRef(allowRefresh);
  canRefresh.current = allowRefresh;
  const retry = useCallback(() => setAttempt(value => value + 1), []);

  useEffect(() => {
    let active = true;
    let settled = false;
    let earlyRefresh: VocabularyLoadResult | undefined;
    if (loadedSource.current !== source) {
      loadedSource.current = source;
      initialized.current = false;
      pendingUpdate.current = undefined;
      setLoadResult(undefined);
    }
    setLoadError(false);
    void loadVocabulary({ preferCache: true, onRefresh: result => {
      if (!active || (getApiBaseUrl() ?? '') !== source) return;
      if (!settled) earlyRefresh = result;
      else if (canRefresh.current) setLoadResult(result);
      else pendingUpdate.current = { source, result };
    } }).then(result => {
      if (!active || (getApiBaseUrl() ?? '') !== source) return;
      settled = true;
      const latest = earlyRefresh ?? result;
      if (!initialized.current || canRefresh.current) {
        setLoadResult(latest);
        pendingUpdate.current = undefined;
      } else pendingUpdate.current = { source, result: latest };
      initialized.current = true;
    }).catch(() => { if (active && (getApiBaseUrl() ?? '') === source) setLoadError(true); });
    return () => { active = false; };
  }, [attempt, source]);

  useEffect(() => {
    if (initialized.current && allowRefresh && pendingUpdate.current) {
      if (pendingUpdate.current.source === (getApiBaseUrl() ?? '')) setLoadResult(pendingUpdate.current.result);
      pendingUpdate.current = undefined;
    }
    const returnedToBooks = allowRefresh && !previousAllowRefresh.current;
    previousAllowRefresh.current = allowRefresh;
    if (returnedToBooks && previousRefreshSource.current === source) retry();
    previousRefreshSource.current = source;
  }, [allowRefresh, source, retry]);

  useEffect(() => navigation?.addListener('focus', retry), [navigation, retry]);
  useEffect(() => {
    let previous = AppState.currentState;
    const subscription = AppState.addEventListener('change', next => {
      if (next === 'active' && previous !== 'active') retry();
      previous = next;
    });
    return () => subscription.remove();
  }, [retry]);

  return { loadResult, loadError, retry };
}
