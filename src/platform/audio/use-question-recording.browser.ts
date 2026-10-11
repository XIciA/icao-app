import { useEffect, useState } from 'react';
import { CryptoDigestAlgorithm, digestStringAsync } from 'expo-crypto';
import { useQuestionBankAsset } from '@/features/question-bank/hooks/useQuestionBankAsset';
import recorded from './opi-recorded-audio.json';

const records: Record<string, { textSha256: string; path: string }> = recorded.records;

/** Reuse the existing private resource resolver, never a public copy of OPI audio. */
export function useQuestionRecording(id?: string, text?: string) {
  const candidate = id && text ? records[id] : undefined;
  const [match, setMatch] = useState<{ id?: string; text?: string; path?: string }>();
  useEffect(() => {
    let active = true;
    if (candidate && text) {
      void digestStringAsync(CryptoDigestAlgorithm.SHA256, text).then(hash => {
        if (active) setMatch({ id, text, path: hash === candidate.textSha256 ? candidate.path : undefined });
      }).catch(() => { if (active) setMatch({ id, text }); });
    }
    return () => { active = false; };
  }, [candidate, id, text]);
  const matched = match?.id === id && match?.text === text;
  const asset = useQuestionBankAsset(candidate && matched ? match?.path : undefined);
  return { ...asset, resolving: Boolean(candidate && !matched) || asset.resolving };
}
