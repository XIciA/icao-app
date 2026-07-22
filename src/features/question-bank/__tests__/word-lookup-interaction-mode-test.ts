import { resolveWordLookupInteraction, showsWordLookupModeToggle } from '../lib/word-lookup-interaction';

describe('word lookup interaction mode', () => {
  it('keeps native lookup on long press', () => {
    expect(resolveWordLookupInteraction('ios')).toBe('long-press');
    expect(resolveWordLookupInteraction('android', 'dictionary')).toBe('long-press');
    expect(showsWordLookupModeToggle('ios')).toBe(false);
  });

  it('requires the explicit web dictionary mode before a tap can look up a word', () => {
    expect(resolveWordLookupInteraction('web')).toBe('disabled');
    expect(resolveWordLookupInteraction('web', 'highlight')).toBe('disabled');
    expect(resolveWordLookupInteraction('web', 'dictionary')).toBe('tap');
    expect(showsWordLookupModeToggle('web')).toBe(true);
  });
});
