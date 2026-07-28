import { clearPreloadedSource, preload } from 'expo-audio';
import { useEffect, useInsertionEffect, useRef } from 'react';

import { resolveQuestionBankAsset } from '../platform/resource-service';
import type { QuestionBankCard } from '../types';

const NEXT_AUDIO_PRELOAD_DELAY_MS = 750;

function audioUri(card?: QuestionBankCard) {
  return card && card.kind !== 'image' && card.audio
    ? resolveQuestionBankAsset(card.audio)
    : undefined;
}

export function ensureQuestionBankAudioConnectionHint(uri?: string) {
  if (!uri || typeof document === 'undefined') return;
  let origin: string;
  try {
    origin = new URL(uri).origin;
  } catch {
    return;
  }
  const exists = Array.from(document.head.querySelectorAll<HTMLLinkElement>('link[rel="preconnect"]'))
    .some((link) => link.href === `${origin}/` || link.href === origin);
  if (exists) return;
  const link = document.createElement('link');
  link.crossOrigin = 'anonymous';
  link.href = origin;
  link.rel = 'preconnect';
  document.head.appendChild(link);
}

export function useQuestionBankAudioPreload(
  cards: QuestionBankCard[],
  currentIndex: number,
  currentAudioReady: boolean,
) {
  const ownedSources = useRef(new Set<string>());

  useInsertionEffect(() => {
    ensureQuestionBankAudioConnectionHint(audioUri(cards[currentIndex]));
    ensureQuestionBankAudioConnectionHint(audioUri(cards[currentIndex + 1]));
  }, [cards, currentIndex]);

  useEffect(() => {
    const currentUri = audioUri(cards[currentIndex]);
    const nextUri = audioUri(cards[currentIndex + 1]);
    const desiredSources = new Set([currentUri, nextUri].filter((uri): uri is string => Boolean(uri)));

    ownedSources.current.forEach((uri) => {
      if (desiredSources.has(uri)) return;
      ownedSources.current.delete(uri);
      void Promise.resolve(clearPreloadedSource(uri)).catch(() => undefined);
    });

    if (!currentAudioReady || !nextUri || ownedSources.current.has(nextUri)) return;
    const timeout = setTimeout(() => {
      ownedSources.current.add(nextUri);
      void Promise.resolve(preload(nextUri)).catch(() => {
        ownedSources.current.delete(nextUri);
      });
    }, NEXT_AUDIO_PRELOAD_DELAY_MS);
    return () => clearTimeout(timeout);
  }, [cards, currentAudioReady, currentIndex]);

  useEffect(() => () => {
    ownedSources.current.forEach((uri) => {
      void Promise.resolve(clearPreloadedSource(uri)).catch(() => undefined);
    });
    ownedSources.current.clear();
  }, []);
}
