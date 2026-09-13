import { Asset } from 'expo-asset';
import { Directory, File, Paths } from 'expo-file-system';

import { APP_BRAND_LOGO_SOURCE } from '@/components/brand/AppBrandLogo.native';

import { clampRadioInterval } from './radio-interval';
import { selectShuffleTrack, type ShuffleState } from './queue';
import type { RadioBankId, RadioPlaybackMode } from './types';

export const RADIO_INTERVAL_SILENCE_DURATION_SECONDS = 30;

const radioIntervalSilenceAsset = Asset.fromModule(require('../../../assets/audio/radio-interval-silence-30s.wav'));

const intervalUris = new Map<number, string>();

/** Keep the full square source in Metro's bundle; the system owns artwork clipping. */
export function getRadioArtwork(): string | undefined {
  try {
    const asset = Asset.fromModule(APP_BRAND_LOGO_SOURCE);
    return asset.localUri ?? asset.uri;
  } catch {
    // Optional metadata must never prevent an otherwise playable track from loading.
    if (__DEV__) console.warn('[radio] Bundled artwork could not be resolved');
    return undefined;
  }
}

/** Exact finite media duration avoids a background JS seek being required to shorten a 30s file. */
export async function ensureRadioIntervalSilenceAsset(seconds = RADIO_INTERVAL_SILENCE_DURATION_SECONDS) {
  const duration = Math.max(1, clampRadioInterval(seconds));
  const directory = new Directory(Paths.cache, 'icao-radio-intervals');
  directory.create({ intermediates: true, idempotent: true });
  const file = new File(directory, `silence-${duration}s.wav`);
  const byteLength = duration * 8_000 * 2;
  if (!file.exists || file.size !== byteLength + 44) {
    const bytes = new Uint8Array(byteLength + 44);
    const view = new DataView(bytes.buffer);
    const text = (offset: number, value: string) => { for (let i = 0; i < value.length; i += 1) bytes[offset + i] = value.charCodeAt(i); };
    text(0, 'RIFF'); view.setUint32(4, byteLength + 36, true); text(8, 'WAVE'); text(12, 'fmt ');
    view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
    view.setUint32(24, 8_000, true); view.setUint32(28, 16_000, true);
    view.setUint16(32, 2, true); view.setUint16(34, 16, true); text(36, 'data'); view.setUint32(40, byteLength, true);
    file.write(bytes);
  }
  intervalUris.set(duration, file.uri);
  return file.uri;
}

export type NativeRadioContentTrack = {
  album: string;
  artist: string;
  artwork?: string;
  duration: number;
  id: string;
  radioBankId: RadioBankId;
  radioTrackId: string;
  radioTrackKind: 'content';
  radioGeneration?: number;
  title: string;
  url: string;
};

export type NativeRadioIntervalTrack = {
  album: string;
  artist: string;
  artwork?: string;
  duration: number;
  id: string;
  radioBankId: RadioBankId;
  radioIntervalSeconds: number;
  radioSourceTrackId: string;
  radioTrackKind: 'interval';
  radioGeneration?: number;
  title: string;
  url: string;
};

export type NativeRadioTrack = NativeRadioContentTrack | NativeRadioIntervalTrack;

export function radioIntervalStartPosition(_seconds: number) {
  return 0;
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
    artwork: source.artwork,
    duration: intervalSeconds,
    id: `radio-interval:${source.radioBankId}:${source.radioTrackId}:${instanceId}`,
    radioBankId: source.radioBankId,
    radioIntervalSeconds: intervalSeconds,
    radioSourceTrackId: source.radioTrackId,
    radioTrackKind: 'interval',
    radioGeneration: source.radioGeneration,
    title: source.title,
    url: intervalUris.get(intervalSeconds) ?? radioIntervalSilenceAsset.localUri ?? radioIntervalSilenceAsset.uri,
  };
}

export function isNativeRadioIntervalTrack(value: unknown): value is NativeRadioIntervalTrack {
  return Boolean(value && typeof value === 'object' && 'radioTrackKind' in value && value.radioTrackKind === 'interval');
}

export function isNativeRadioContentTrack(value: unknown): value is NativeRadioContentTrack {
  return Boolean(value && typeof value === 'object' && 'radioTrackKind' in value && value.radioTrackKind === 'content');
}

/** Native automatic transitions keep the forward history after Previous. */
export function selectNativeShuffleTrack(state: ShuffleState, trackId: string): ShuffleState {
  if (state.history[state.cursor] === trackId) return state;
  if (state.history[state.cursor + 1] === trackId) return { ...state, cursor: state.cursor + 1 };
  return selectShuffleTrack(state, trackId);
}
