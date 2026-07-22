import staticLookupDataset from '../../../../content/word-lookup/dataset.json';

import { normalizeStaticLookupWord } from './normalize';

export type StaticWordLookupEntry = {
  word: string;
  ipa: string;
  aviationMeaning: string;
  generalMeaning: string;
};

type StaticWordLookupDataset = {
  entries: StaticWordLookupEntry[];
};

const entries = new Map(
  (staticLookupDataset as StaticWordLookupDataset).entries.map((entry) => [entry.word, entry]),
);

export function findStaticWordLookup(value: string) {
  const word = normalizeStaticLookupWord(value);
  return word ? entries.get(word) : undefined;
}

export function hasStaticWordLookup(value: string) {
  return Boolean(findStaticWordLookup(value));
}
