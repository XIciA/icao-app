import { Geist_400Regular } from '@expo-google-fonts/geist/400Regular';
import { Geist_500Medium } from '@expo-google-fonts/geist/500Medium';
import { Geist_600SemiBold } from '@expo-google-fonts/geist/600SemiBold';
import { GeistMono_400Regular } from '@expo-google-fonts/geist-mono/400Regular';
import { loadAsync } from 'expo-font';
import { useEffect, useState } from 'react';

/**
 * Web must not hold the whole application behind a 14 MB CJK font download.
 * Small UI fonts load opportunistically while system serif/sans fallbacks render
 * the first frame immediately. Native keeps the exact bundled font gate.
 */
export function useAppFonts(): readonly [boolean, Error | null] {
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let active = true;
    void loadAsync({
      Geist_400Regular,
      Geist_500Medium,
      Geist_600SemiBold,
      GeistMono_400Regular,
    }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason : new Error('web_font_load_failed'));
    });
    return () => {
      active = false;
    };
  }, []);

  return [true, error] as const;
}
