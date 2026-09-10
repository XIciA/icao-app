import { renderHook } from '@testing-library/react-native';

import { useQuestionAnnotations } from '../annotations/use-question-annotations-with-save.native';

const mockSaveNote = jest.fn();
const mockFlush = jest.fn();
let mockOwner = 'account-a';
jest.mock('../annotations/use-question-annotations', () => ({
  useQuestionAnnotations: () => ({ saveNote: mockSaveNote }),
}));
jest.mock('../annotations/annotation-store.native', () => ({
  flushPendingAnnotationSaves: (...args: unknown[]) => mockFlush(...args),
}));
jest.mock('@/features/sync/learning-sync.native', () => ({
  captureLearningWriteContext: () => ({ ownerToken: mockOwner, aiToken: 0 }),
}));

beforeEach(() => { jest.clearAllMocks(); mockOwner = 'account-a'; mockFlush.mockResolvedValue(true); });

it('retains the existing shared annotation actions and exposes the Native save result', async () => {
  const hook = await renderHook(() => useQuestionAnnotations());
  expect(hook.result.current.saveNote).toBe(mockSaveNote);
  await expect(hook.result.current.flushPendingSaves()).resolves.toBe(true);
  mockFlush.mockResolvedValueOnce(false);
  await expect(hook.result.current.flushPendingSaves()).resolves.toBe(false);
});

it('binds the exit check to the original workspace rather than a later account', async () => {
  const hook = await renderHook(() => useQuestionAnnotations());
  mockOwner = 'account-b';
  await hook.rerender({});
  await hook.result.current.flushPendingSaves();
  expect(mockFlush).toHaveBeenCalledWith({ ownerToken: 'account-a', aiToken: 0 });
});
