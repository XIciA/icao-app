import { createAudioUploadForm } from '../audio-upload.web';

const originalFormData = Object.getOwnPropertyDescriptor(globalThis, 'FormData');
const originalFetch = Object.getOwnPropertyDescriptor(globalThis, 'fetch');

function restoreProperty(key: PropertyKey, descriptor?: PropertyDescriptor) {
  if (descriptor) Object.defineProperty(globalThis, key, descriptor);
  else delete (globalThis as Record<PropertyKey, unknown>)[key];
}

describe('Web audio upload', () => {
  afterEach(() => {
    restoreProperty('FormData', originalFormData);
    restoreProperty('fetch', originalFetch);
  });

  it.each([
    ['audio/ogg;codecs=opus', 'ogg', '16k_en'],
    ['audio/webm;codecs=opus', 'webm', '16k_en_large'],
    ['audio/mp4', 'm4a', '16k_zh_en_2.0'],
    ['audio/wav', 'wav', '16k_en'],
  ] as const)('uploads %s with its selected ASR model before the audio', async (mime, extension, model) => {
    const blob = new Blob([new Uint8Array(600)], { type: mime });
    const append = jest.fn();
    Object.defineProperty(globalThis, 'FormData', {
      configurable: true,
      value: jest.fn(() => ({ append })),
    });
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: jest.fn(async () => ({ blob: async () => blob, ok: true })),
    });

    const upload = await createAudioUploadForm('blob:browser-recording', model);

    expect(append).toHaveBeenNthCalledWith(1, 'model', model);
    expect(append).toHaveBeenNthCalledWith(2, 'audio', blob, `recording.${extension}`);
    expect(append).toHaveBeenCalledTimes(2);
    expect(upload.fetch).toBe(globalThis.fetch);
  });

  it('does not upload an unavailable recording', async () => {
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: jest.fn(async () => ({ ok: false })),
    });
    await expect(createAudioUploadForm('blob:missing', '16k_en')).rejects.toThrow('recording_asset_missing');
  });
});
