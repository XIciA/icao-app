import { Platform } from 'react-native';

export function resolveUiAcceptanceAvailability(platform: string, enabled: string | undefined) {
  return platform === 'web' && enabled === '1';
}

export const UI_ACCEPTANCE_MODE_AVAILABLE = resolveUiAcceptanceAvailability(
  Platform.OS,
  process.env.EXPO_PUBLIC_ICAO_UI_ACCEPTANCE,
);
