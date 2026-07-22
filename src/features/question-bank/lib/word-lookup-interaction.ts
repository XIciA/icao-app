export type WordLookupInteraction = 'disabled' | 'long-press' | 'tap';

export function resolveWordLookupInteraction(platform: string, toolMode?: string): WordLookupInteraction {
  if (platform === 'web') return toolMode === 'dictionary' ? 'tap' : 'disabled';
  return 'long-press';
}

export function showsWordLookupModeToggle(platform: string) {
  return platform === 'web';
}
