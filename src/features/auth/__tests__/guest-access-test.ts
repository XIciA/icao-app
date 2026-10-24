import { destinationWithQuery, isGuestPublicPath, isPublicStackScreen, publicLoginReturn, safeAppDestination } from '../guest-access';

describe('guest access boundary', () => {
  it.each(['/', '/(tabs)', '/(tabs)/profile', '/profile', '/discover', '/download', '/legal/agreement', '/legal/privacy', '/question-bank/listening', '/question-bank/listening/study/main/topic'])('allows only public browsing at %s', path => {
    expect(isGuestPublicPath(path)).toBe(true);
  });
  it.each(['/account/profile', '/learning-records', '/content/radio', '/content/mock-exam', '/info/guide', '/info/feedback', '/legal/feedback', '/legal/tutorial'])('requires login at %s', path => {
    expect(isGuestPublicPath(path)).toBe(false);
  });
  it('keeps parameterized account and learning screens unmounted for guests', () => {
    expect(isPublicStackScreen('account/[slug]', { slug: 'profile' })).toBe(false);
    expect(isPublicStackScreen('question-bank/[bankId]/index', { bankId: 'listening' })).toBe(true);
    expect(isPublicStackScreen('info/[slug]', { slug: 'feedback' })).toBe(false);
    expect(isPublicStackScreen('legal/[slug]', { slug: 'feedback' })).toBe(false);
    expect(isPublicStackScreen('info/[slug]', { slug: 'privacy' })).toBe(true);
  });
  it('preserves deep-link search parameters while excluding duplicated path params', () => {
    expect(destinationWithQuery('/question-bank/listening/study/main/topic', {
      bankId: 'listening', categoryId: 'main', topicId: 'topic', cardId: 'card 2', mode: 'practice',
    })).toBe('/question-bank/listening/study/main/topic?cardId=card+2&mode=practice');
  });
  it.each(['https://example.com', '//example.com', '/\\example.com', '/auth/login', '/legal/privacy'])('rejects unsafe or looping saved targets %s', target => {
    expect(safeAppDestination(target)).toBeUndefined();
  });
  it('only returns cancelled login to a public page', () => {
    expect(publicLoginReturn('/discover')).toBe('/discover');
    expect(publicLoginReturn('/account/profile')).toBe('/(tabs)');
    expect(publicLoginReturn(undefined)).toBe('/(tabs)');
  });
});
