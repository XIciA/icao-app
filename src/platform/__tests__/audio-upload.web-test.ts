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

  it('uses an Ogg filename for an Ogg browser recording', async () => {
    const blob = new Blob([new Uint8Array(600)], { type: 'audio/ogg;codecs=opus' });
    const append = jest.fn();
    Object.defineProperty(globalThis, 'FormData', {
      configurable: true,
      value: jest.fn(() => ({ append })),
    });
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: jest.fn(async () => ({ blob: async () => blob, ok: true })),
    });

    await createAudioUploadForm('blob:ogg-recording');

    expect(append).toHaveBeenCalledWith('audio', blob, 'recording.ogg');
  });
});
