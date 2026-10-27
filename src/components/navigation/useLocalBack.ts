import { usePreventRemove } from '@react-navigation/native';
import { useRef } from 'react';
import { Platform } from 'react-native';

/** Buttons and system back share one action, including pending-save protection. */
export function useLocalBack(enabled: boolean, onBack: () => void) {
  const until = useRef(0);
  const back = () => {
    if (Date.now() < until.current) return;
    until.current = Date.now() + 450;
    onBack();
  };
  usePreventRemove(Platform.OS !== 'web' && enabled, back);
  return back;
}
