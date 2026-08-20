jest.mock('@/platform/audio/audio-diagnostics', () => ({ emitAudioDiagnostic: jest.fn() }));

// The platform suffix is intentional: browser recordings are compressed Blob assets,
// so they have a lower valid-size floor than native WAV recordings.
// eslint-disable-next-line import/first
import { RecordingRepository } from '../recording-repository.web';

let urlSequence = 0;

function rawBlobUri(size: number) {
  const uri = `blob:raw-${urlSequence += 1}`;
  const webBlob = new Blob([new Uint8Array(size)], { type: 'audio/webm;codecs=opus' });
  return { uri, webBlob };
}

describe('Web RecordingRepository', () => {
  beforeEach(() => {
    jest.spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:committed-${urlSequence += 1}`);
    jest.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    jest.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('commits a valid compressed WebM recording below the native WAV size floor', async () => {
    const raw = rawBlobUri(600);
    const asset = await new RecordingRepository().commitRaw({
      cardId: 'card-1',
      durationMillis: 900,
      format: 'webm',
      sessionId: 'session-1',
      ...raw,
    });

    expect(asset).toMatchObject({
      byteSize: 600,
      cardId: 'card-1',
      durationMillis: 900,
      format: 'webm',
      sessionId: 'session-1',
    });
    expect(asset.uri).toMatch(/^blob:/);
    expect(asset.uri).toBe(raw.uri);
    expect(fetch).not.toHaveBeenCalled();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
  });

  it('still rejects an empty or header-only browser recording', async () => {
    const raw = rawBlobUri(128);

    await expect(new RecordingRepository().commitRaw({
      cardId: 'card-1',
      durationMillis: 2_000,
      format: 'webm',
      sessionId: 'session-1',
      ...raw,
    })).rejects.toMatchObject({ code: 'recording_file_incomplete' });
  });

  it('rejects a Web raw asset that did not transfer its Blob', async () => {
    await expect(new RecordingRepository().commitRaw({
      cardId: 'card-1',
      durationMillis: 2_000,
      format: 'webm',
      sessionId: 'session-1',
      uri: 'blob:missing-transfer',
    })).rejects.toMatchObject({ code: 'recording_commit_failed' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects a non-Blob URI instead of registering an unplayable asset', async () => {
    await expect(new RecordingRepository().commitRaw({
      cardId: 'card-1',
      durationMillis: 2_000,
      format: 'webm',
      sessionId: 'session-1',
      uri: 'https://example.test/recording.webm',
      webBlob: new Blob([new Uint8Array(600)], { type: 'audio/webm' }),
    })).rejects.toMatchObject({ code: 'recording_commit_failed' });
  });

  it('rejects an empty or unknown Web Blob MIME type', async () => {
    await expect(new RecordingRepository().commitRaw({
      cardId: 'card-1',
      durationMillis: 2_000,
      format: 'webm',
      sessionId: 'session-1',
      uri: 'blob:unknown-mime',
      webBlob: new Blob([new Uint8Array(600)]),
    })).rejects.toMatchObject({ code: 'recording_file_incomplete' });
  });
});
