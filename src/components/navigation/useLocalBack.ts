import { usePreventRemove } from '@react-navigation/native';
import { Platform } from 'react-native';

/** Keep native swipe / Android back at the same internal level as the toolbar. */
export function useLocalBack(enabled: boolean, onBack: () => void) {
  usePreventRemove(Platform.OS !== 'web' && enabled, onBack);
}
