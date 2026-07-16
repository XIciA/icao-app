import { Asset } from 'expo-asset';

import type { RadioBankId, RadioPlaybackMode } from './types';

export const RADIO_INTERVAL_MAX_SECONDS = 30;
export const RADIO_INTERVAL_PRESETS = [0, 3, 5, 10, 15, 30] as const;
export const RADIO_INTERVAL_SILENCE_DURATION_SECONDS = 30;

const radioIntervalSilenceAsset = Asset.fromModule(require('../../../assets/audio/radio-interval-silence-30s.wav'));

export async function ensureRadioIntervalSilenceAsset() {
  const asset = await radioIntervalSilenceAsset.downloadAsync();
  return asset.localUri ?? asset.uri;
}

export type NativeRadioContentTrack = {
  album: string;
  artist: string;
  duration: number;
  id: string;
  radioBankId: RadioBankId;
  radioTrackId: string;
  radioTrackKind: 'content';
  title: string;
  url: string;
};

export type NativeRadioIntervalTrack = {
  album: string;
  artist: string;
  duration: number;
  id: string;
  radioBankId: RadioBankId;
  radioIntervalSeconds: number;
  radioSourceTrackId: string;
  radioTrackKind: 'interval';
  title: string;
  url: string;
};

export type NativeRadioTrack = NativeRadioContentTrack | NativeRadioIntervalTrack;

export function clampRadioInterval(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(RADIO_INTERVAL_MAX_SECONDS, Math.round(value)));
}

export function radioIntervalStartPosition(seconds: number) {
  return RADIO_INTERVAL_SILENCE_DURATION_SECONDS - clampRadioInterval(seconds);
}

export function getRadioNativeQueueBehavior(mode: RadioPlaybackMode, seconds: number) {
  const intervalSeconds = clampRadioInterval(seconds);
  return {
    automaticTarget: mode === 'repeatOne' && intervalSeconds > 0 ? 'current' as const : 'next' as const,
    includesInterval: intervalSeconds > 0,
    repeatsCurrentNatively: mode === 'repeatOne' && intervalSeconds === 0,
  };
}

export function createNativeRadioIntervalTrack(
  source: NativeRadioContentTrack,
  seconds: number,
  instanceId: number,
): NativeRadioIntervalTrack {
  const intervalSeconds = clampRadioInterval(seconds);
  return {
    album: source.album,
    artist: source.artist,
    duration: RADIO_INTERVAL_SILENCE_DURATION_SECONDS,
    id: `radio-interval:${source.radioBankId}:${source.radioTrackId}:${instanceId}`,
    radioBankId: source.radioBankId,
    radioIntervalSeconds: intervalSeconds,
    radioSourceTrackId: source.radioTrackId,
    radioTrackKind: 'interval',
    title: source.title,
    url: radioIntervalSilenceAsset.localUri ?? radioIntervalSilenceAsset.uri,
  };
}

export function isNativeRadioIntervalTrack(value: unknown): value is NativeRadioIntervalTrack {
  return Boolean(value && typeof value === 'object' && 'radioTrackKind' in value && value.radioTrackKind === 'interval');
}

export function isNativeRadioContentTrack(value: unknown): value is NativeRadioContentTrack {
  return Boolean(value && typeof value === 'object' && 'radioTrackKind' in value && value.radioTrackKind === 'content');
}
