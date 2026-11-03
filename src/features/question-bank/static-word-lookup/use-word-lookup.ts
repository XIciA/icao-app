import { useEffect, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { subscribeConnectivity } from '../platform/network-service';
import { refreshStaticWordLookup, staticWordLookupRevision, subscribeStaticWordLookup } from './repository';

export function useWordLookupUpdates() {
  const revision = useSyncExternalStore(subscribeStaticWordLookup, staticWordLookupRevision, () => 0);
  useEffect(() => {
    const refresh = () => { void refreshStaticWordLookup().catch(() => undefined); };
    refresh();
    const app = AppState.addEventListener('change', state => { if (state === 'active') refresh(); });
    const network = subscribeConnectivity(state => { if (state !== 'offline') refresh(); });
    return () => { app.remove(); network(); };
  }, []);
  return revision;
}
