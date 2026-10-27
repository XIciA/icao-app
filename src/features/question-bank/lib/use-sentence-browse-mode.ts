import { useEffect, useSyncExternalStore } from 'react';
import Storage from '@/platform/storage';
import { useAuth } from '@/features/auth/AuthProvider';

const modes = new Map<string, boolean>();
const loaded = new Set<string>();
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const notify = () => listeners.forEach(listener => listener());
/** One account-scoped display preference, shared by the catalog and radio directory. */
export function useSentenceBrowseMode() {
  const account = useAuth().account?.accountId ?? 'guest';
  const key = `icao.sentence-browser.v1.${account}`;
  const sceneMode = useSyncExternalStore(subscribe, () => modes.get(key) ?? false, () => false);
  useEffect(() => {
    if (loaded.has(key)) return;
    loaded.add(key);
    void Storage.getItem(key).then(value => {
      if (!modes.has(key)) { modes.set(key, value === 'scene'); notify(); }
    }).catch(() => { loaded.delete(key); });
  }, [key]);
  return [sceneMode, (scene: boolean) => {
    modes.set(key, scene); notify();
    void Storage.setItem(key, scene ? 'scene' : 'level').catch(() => {});
  }] as const;
}
