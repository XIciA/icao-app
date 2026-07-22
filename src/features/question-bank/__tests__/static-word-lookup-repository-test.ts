import { findStaticWordLookup, hasStaticWordLookup } from '../static-word-lookup/repository';

describe('static word lookup repository', () => {
  it('returns the approved local descent entry with a single US IPA', () => {
    expect(findStaticWordLookup('descent,')).toEqual({
      word: 'descent',
      ipa: '/dɪˈsent/',
      aviationMeaning: 'n. 下降',
      generalMeaning: 'n. 斜坡；恶化；沦落；血统',
    });
    expect(hasStaticWordLookup('A320')).toBe(false);
  });
});
