import { postLoginDestination, destinationWithQuery, isGuestPublicPath, isPublicStackScreen, publicLoginReturn, safeAppDestination } from '../guest-access';

describe('guest access boundary', () => {
  it.each(['/', '/(tabs)', '/(tabs)/profile', '/profile', '/discover', '/download', '/content/courses', '/content/vocab', '/content/radio', '/content/hotspot', '/content/hotspot/day', '/content/resources', '/content/resources/article', '/account/membership', '/content/mock-exam', '/legal/agreement', '/legal/privacy', '/question-bank/listening', '/question-bank/listening/study/main/topic'])('allows only public browsing at %s', path => {
    expect(isGuestPublicPath(path)).toBe(true);
  });
  it.each(['/account/profile', '/learning-records', '/info/guide', '/info/feedback', '/legal/feedback', '/legal/tutorial'])('requires login at %s', path => {
    expect(isGuestPublicPath(path)).toBe(false);
  });
  it('allows public discovery screens while account screens remain protected', () => {
    expect(isPublicStackScreen('content/[slug]', { slug: 'courses' })).toBe(true);
    expect(isPublicStackScreen('content/[slug]', { slug: 'radio' })).toBe(true);
    expect(isPublicStackScreen('content/[slug]', { slug: ['courses', 'radio'] })).toBe(false);
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

it('only resumes explicit content links, never remembered tabs or account pages', () => {
  expect(postLoginDestination({ next: '/(tabs)/profile' })).toBe('/(tabs)');
  expect(postLoginDestination({ next: '/question-bank/listening' })).toBe('/(tabs)');
  expect(postLoginDestination({ intent: 'external', next: '/question-bank/listening/study/main/topic?cardId=2' })).toBe('/question-bank/listening/study/main/topic?cardId=2');
  expect(postLoginDestination({ intent: 'external', next: '/content/resources/article' })).toBe('/content/resources/article');
  expect(postLoginDestination({ intent: 'external', next: '/account/profile' })).toBe('/(tabs)');
  expect(postLoginDestination({ intent: 'external', next: '//other.example' })).toBe('/(tabs)');
});

it('returns a deliberate membership login to the original purchase target', () => {
  expect(postLoginDestination({intent:'membership', next:'/account/membership?next=%2Fcontent%2Fmock-exam'})).toBe('/account/membership?next=%2Fcontent%2Fmock-exam');
  expect(postLoginDestination({intent:'membership', next:'/account/settings'})).toBe('/(tabs)');
});

it('resumes a deliberate feature action while rejecting looping or external targets', () => {
  expect(postLoginDestination({ intent: 'feature', next: '/info/feedback?source=exam' })).toBe('/info/feedback?source=exam');
  expect(postLoginDestination({ intent: 'feature', next: '/content/mock-exam' })).toBe('/content/mock-exam');
  expect(postLoginDestination({ intent: 'feature', next: '/auth/login' })).toBe('/(tabs)');
  expect(postLoginDestination({ intent: 'feature', next: '//other.example' })).toBe('/(tabs)');
});
