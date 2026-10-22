import { useRouter } from 'expo-router';
import { useMemo, useRef } from 'react';
import { Platform } from 'react-native';

/** One navigation action per tap burst, without changing route identity or history. */
export function createNavigationGate(now = Date.now) {
  let until = 0;
  return (action: () => void) => {
    if (now() < until) return;
    until = now() + 450;
    try { action(); } catch (error) { until = 0; throw error; }
  };
}

export function useAppRouter() {
  const router = useRouter();
  const gate = useRef<ReturnType<typeof createNavigationGate> | null>(null);
  if (!gate.current) gate.current = createNavigationGate();
  return useMemo(() => Platform.OS === 'web' ? router : ({
    ...router,
    push: (...args: Parameters<typeof router.push>) => gate.current!(() => router.push(...args)),
    back: () => gate.current!(() => router.back()),
    dismissTo: (...args: Parameters<typeof router.dismissTo>) => gate.current!(() => router.dismissTo(...args)),
  }), [router]);
}
