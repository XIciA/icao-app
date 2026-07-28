import { useEffect, useInsertionEffect, useRef } from 'react';

import { resolveQuestionBankAsset } from '../platform/resource-service';
import type { QuestionBankCard } from '../types';

const NEXT_AUDIO_PRELOAD_DELAY_MS = 750;

type OwnedPreload = {
  audio: HTMLAudioElement;
  uri: string;
};

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
  const ownedPreload = useRef<OwnedPreload | undefined>(undefined);

  useInsertionEffect(() => {
    ensureQuestionBankAudioConnectionHint(audioUri(cards[currentIndex]));
    ensureQuestionBankAudioConnectionHint(audioUri(cards[currentIndex + 1]));
  }, [cards, currentIndex]);

  useEffect(() => {
    const nextUri = audioUri(cards[currentIndex + 1]);

    function disposeOwnedPreload() {
      const owned = ownedPreload.current;
      if (!owned) return;
      ownedPreload.current = undefined;
      try {
        owned.audio.pause();
        owned.audio.removeAttribute('src');
        owned.audio.load();
      } catch {
        // Preloading is only a best-effort performance hint.
      }
    }

    if (ownedPreload.current && ownedPreload.current.uri !== nextUri) disposeOwnedPreload();
    if (
      !currentAudioReady
      || !nextUri
      || ownedPreload.current?.uri === nextUri
      || typeof Audio === 'undefined'
    ) return;
    const timeout = setTimeout(() => {
      if (ownedPreload.current && ownedPreload.current.uri !== nextUri) disposeOwnedPreload();
      if (ownedPreload.current?.uri === nextUri) return;
      const audio = new Audio();
      audio.crossOrigin = 'anonymous';
      audio.preload = 'auto';
      audio.src = nextUri;
      ownedPreload.current = { audio, uri: nextUri };
      try {
        audio.load();
      } catch {
        disposeOwnedPreload();
      }
    }, NEXT_AUDIO_PRELOAD_DELAY_MS);
    return () => clearTimeout(timeout);
  }, [cards, currentAudioReady, currentIndex]);

  useEffect(() => () => {
    const owned = ownedPreload.current;
    ownedPreload.current = undefined;
    if (!owned) return;
    try {
      owned.audio.pause();
      owned.audio.removeAttribute('src');
      owned.audio.load();
    } catch {
      // Preloading is only a best-effort performance hint.
    }
  }, []);
}
