import { NavigationContext } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { createContext, useContext, useEffect, useMemo, useRef } from 'react';
import { Platform } from 'react-native';
import { isVercelLegacyWeb } from '@/config/web-runtime';

/** One navigation action per tap burst, without changing route identity or history. */
export function createNavigationGate(now = Date.now) {
  let until = 0;
  let transitioning = false;
  const run = (action: () => void) => {
    if (transitioning || now() < until) return;
    until = now() + 450;
    try { action(); } catch (error) { until = 0; throw error; }
  };
  run.reset = () => { until = 0; };
  run.beginTransition = () => { transitioning = true; };
  run.endTransition = () => { transitioning = false; until = 0; };
  return run;
}

type NavigationOwner = { isFocused: () => boolean };
const screenGates = new WeakMap<NavigationOwner, ReturnType<typeof createNavigationGate>>();
// The fallback also permits isolated component tests without a navigator.
const emptyNavigationContext = createContext<undefined>(undefined);
export function navigationGateFor(owner: NavigationOwner) {
  let gate = screenGates.get(owner);
  if (!gate) { gate = createNavigationGate(); screenGates.set(owner, gate); }
  return (action: () => void) => { if (owner.isFocused()) gate(action); };
}

export function useAppRouter() {
  const router = useRouter();
  const navigation = useContext(NavigationContext ?? emptyNavigationContext);
  const localGate = useRef(createNavigationGate());
  const run = useMemo(() => navigation ? navigationGateFor(navigation) : localGate.current, [navigation]);
  useEffect(() => {
    if (!navigation) return;
    const gate = screenGates.get(navigation)!;
    // Native-stack emits these for both button-driven and interactive transitions.
    const listen = navigation.addListener as (event: string, callback: () => void) => () => void;
    const unsubscribe = [
      listen('focus', gate.reset),
      // Web does not emit native-stack transition completion events. Its tap
      // gate still shares screen ownership and unlocks when focus returns.
      ...(Platform.OS === 'web' ? [] : [
        listen('transitionStart', gate.beginTransition),
        listen('transitionEnd', gate.endTransition),
        listen('gestureCancel', gate.endTransition),
      ]),
    ];
    return () => unsubscribe.forEach(remove => remove());
  }, [navigation]);
  return useMemo(() => isVercelLegacyWeb(Platform.OS) ? router : ({
    ...router,
    push: (...args: Parameters<typeof router.push>) => run(() => router.push(...args)),
    back: () => run(() => router.back()),
    navigate: (...args: Parameters<typeof router.navigate>) => run(() => router.navigate(...args)),
    dismiss: (...args: Parameters<typeof router.dismiss>) => run(() => router.dismiss(...args)),
    dismissAll: () => run(() => router.dismissAll()),
    dismissTo: (...args: Parameters<typeof router.dismissTo>) => run(() => router.dismissTo(...args)),
  }), [router, run]);
}
