import { clearPreloadedSource, preload } from 'expo-audio';
import { useEffect, useRef } from 'react';

import { resolveQuestionBankAsset } from '../platform/resource-service';
import type { QuestionBankCard } from '../types';

const PRELOAD_AHEAD_COUNT = 2;

export function useQuestionBankAudioPreload(cards: QuestionBankCard[], currentIndex: number) {
  const ownedSources = useRef(new Set<string>());

  useEffect(() => {
    const current = cards[currentIndex];
    const desiredSources = new Set<string>();
    if (current?.kind !== 'image' && current?.audio) {
      const currentUri = resolveQuestionBankAsset(current.audio);
      if (currentUri) desiredSources.add(currentUri);
    }

    for (let offset = 1; offset <= PRELOAD_AHEAD_COUNT; offset += 1) {
      const card = cards[currentIndex + offset];
      if (!card || card.kind === 'image' || !card.audio) continue;
      const uri = resolveQuestionBankAsset(card.audio);
      if (!uri) continue;
      desiredSources.add(uri);
      if (!ownedSources.current.has(uri)) {
        ownedSources.current.add(uri);
        void Promise.resolve(preload(uri)).catch(() => {
          ownedSources.current.delete(uri);
        });
      }
    }

    ownedSources.current.forEach((uri) => {
      if (desiredSources.has(uri)) return;
      ownedSources.current.delete(uri);
      void Promise.resolve(clearPreloadedSource(uri)).catch(() => undefined);
    });
  }, [cards, currentIndex]);

  useEffect(() => () => {
    ownedSources.current.forEach((uri) => {
      void Promise.resolve(clearPreloadedSource(uri)).catch(() => undefined);
    });
    ownedSources.current.clear();
  }, []);
}
