jest.mock('@/platform/audio/audio-diagnostics', () => ({ emitAudioDiagnostic: jest.fn() }));

// The platform suffix is intentional: browser recordings are compressed Blob assets,
// so they have a lower valid-size floor than native WAV recordings.
// eslint-disable-next-line import/first
import { RecordingRepository } from '../recording-repository.web';

const rawBlobs = new Map<string, Blob>();
let urlSequence = 0;

function rawBlobUri(size: number) {
  const uri = `blob:raw-${urlSequence += 1}`;
  rawBlobs.set(uri, new Blob([new Uint8Array(size)], { type: 'audio/webm;codecs=opus' }));
  return uri;
}

describe('Web RecordingRepository', () => {
  beforeEach(() => {
    rawBlobs.clear();
    jest.spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:committed-${urlSequence += 1}`);
    jest.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    jest.spyOn(globalThis, 'fetch').mockImplementation(async (uri: RequestInfo | URL) => {
      const blob = rawBlobs.get(String(uri));
      return { blob: async () => blob, ok: Boolean(blob) } as Response;
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('commits a valid compressed WebM recording below the native WAV size floor', async () => {
    const rawUri = rawBlobUri(1_500);
    const asset = await new RecordingRepository().commitRaw({
      cardId: 'card-1',
      durationMillis: 900,
      format: 'webm',
      minBytesPerMillisecond: 0.05,
      sessionId: 'session-1',
      uri: rawUri,
    });

    expect(asset).toMatchObject({
      byteSize: 1_500,
      cardId: 'card-1',
      durationMillis: 900,
      format: 'webm',
      sessionId: 'session-1',
    });
    expect(asset.uri).toMatch(/^blob:/);
    expect(asset.uri).not.toBe(rawUri);
  });

  it('still rejects an empty or header-only browser recording', async () => {
    const rawUri = rawBlobUri(900);

    await expect(new RecordingRepository().commitRaw({
      cardId: 'card-1',
      durationMillis: 2_000,
      format: 'webm',
      minBytesPerMillisecond: 0.05,
      sessionId: 'session-1',
      uri: rawUri,
    })).rejects.toMatchObject({ code: 'recording_file_incomplete' });
  });
});
