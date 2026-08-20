import { renderHook, waitFor } from '@testing-library/react-native';

import { useQuestionBankAsset } from '../hooks/useQuestionBankAsset.web';

const mockResolveRemote = jest.fn(async (_path: string, _options?: { forceRefresh?: boolean }) =>
  'https://cloud.readyoufife.com/storage/v1/object/sign/question-bank-assets/audio.mp3?token=test');

jest.mock('@/config/web-runtime', () => ({ isEdgeOneProductionWeb: () => true }));
jest.mock('../platform/resource-service', () => ({
  resolveQuestionBankAsset: () => undefined,
  resolveRemoteQuestionBankAsset: (path: string, options?: { forceRefresh?: boolean }) => mockResolveRemote(path, options),
}));

describe('EdgeOne question-bank resource hook', () => {
  beforeEach(() => mockResolveRemote.mockClear());

  it('resolves private audio through the authenticated ECS resource endpoint', async () => {
    const hook = await renderHook(() => useQuestionBankAsset('/question-bank-assets/audio/listening/main/001.mp3'));

    await waitFor(() => expect(hook.result.current.resolving).toBe(false));
    expect(hook.result.current.uri).toContain('https://cloud.readyoufife.com/storage/v1/object/sign/');
    expect(mockResolveRemote).toHaveBeenCalledWith(
      '/question-bank-assets/audio/listening/main/001.mp3',
      { forceRefresh: false },
    );
  });
});
