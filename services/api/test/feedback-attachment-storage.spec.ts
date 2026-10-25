import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiConfig } from '../src/config';
import { FeedbackAttachmentStorage } from '../src/feedback/feedback-attachment-storage';

const mocks = vi.hoisted(() => ({ sign: vi.fn(), from: vi.fn(), client: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.client }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.from.mockReturnValue({ createSignedUrl: mocks.sign });
  mocks.client.mockReturnValue({ storage: { from: mocks.from } });
});

describe('feedback attachment public download address', () => {
  it('keeps signing on private storage but returns a public HTTPS image URL to old and new clients', async () => {
    const config = { supabaseUrl: 'http://storage-internal:8000/', supabasePublicUrl: 'https://cloud.example.test/', supabaseSecretKey: 'test-key' } as ApiConfig;
    mocks.sign.mockResolvedValue({ data: { signedUrl: 'http://storage-internal:8000/storage/v1/object/sign/feedback-screenshots/feedback/old-image.png?token=signed-image-token' }, error: null });
    const result = await new FeedbackAttachmentStorage(config).signedUrl('feedback/old-image.png');
    expect(result).toBe('https://cloud.example.test/storage/v1/object/sign/feedback-screenshots/feedback/old-image.png?token=signed-image-token');
    expect(mocks.client).toHaveBeenCalledWith(config.supabaseUrl, config.supabaseSecretKey, expect.anything());
    expect(mocks.from).toHaveBeenCalledWith('feedback-screenshots');
    expect(mocks.sign).toHaveBeenCalledWith('feedback/old-image.png', 300);
  });

  it('does not hide storage signing failures', async () => {
    mocks.sign.mockResolvedValue({ data: null, error: new Error('missing') });
    const storage = new FeedbackAttachmentStorage({ supabaseUrl: 'http://storage-internal:8000', supabasePublicUrl: 'https://cloud.example.test', supabaseSecretKey: 'test-key' } as ApiConfig);
    await expect(storage.signedUrl('feedback/missing.png')).rejects.toThrow('feedback_image_unavailable');
  });
});
