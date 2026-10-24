import { getIcaoDistributionEnvironment } from '@icao/distribution-environment';
import { applicationId } from 'expo-application';
import { Platform } from 'react-native';
import { UI_ACCEPTANCE_MODE_AVAILABLE } from '@/features/auth/ui-acceptance-mode';

/** Temporary testing utility. Remove together with the profile reset button before public launch. */
export function isGuideTestingAvailable() {
  return __DEV__ || UI_ACCEPTANCE_MODE_AVAILABLE
    || (Platform.OS === 'ios' && getIcaoDistributionEnvironment() === 'sandbox')
    || (Platform.OS === 'android' && applicationId?.endsWith('.test') === true);
}
