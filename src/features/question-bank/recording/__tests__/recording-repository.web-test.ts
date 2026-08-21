jest.mock('@/platform/audio/audio-diagnostics', () => ({ emitAudioDiagnostic: jest.fn() }));
jest.mock('../recording-media-probe', () => ({
  recordingMediaProbe: { probe: jest.fn() },
}));

// eslint-disable-next-line import/first
import { RecordingRepository } from '../recording-repository.web';

let urlSequence = 0;

function raw(size: number, durationMs = 900, mimeType = 'audio/webm') {
  return {
    blob: new Blob([new Uint8Array(size)], { type: mimeType }),
    cardId: 'card-1',
    format: 'webm' as const,
    kind: 'web-blob' as const,
    mimeType,
    operationDurationMs: durationMs,
    recorderDurationMs: durationMs,
    recorderMimeType: 'audio/webm;codecs=opus',
    sessionId: 'session-1',
  };
}

function repository() {
  return new RecordingRepository({
    mediaProbe: {
      probe: async (input) => ({
        durationMs: input.recorderDurationMs,
        hasAudioTrack: true,
        playable: true,
      }),
    },
  });
}

describe('Web RecordingRepository', () => {
  beforeEach(() => {
    jest.spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:committed-${urlSequence += 1}`);
    jest.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it('creates the only Blob URL when committing a valid compressed recording', async () => {
    const asset = await repository().commitRaw(raw(600));
    expect(asset).toMatchObject({
      byteSize: 600,
      durationMillis: 900,
      format: 'webm',
      mimeType: 'audio/webm',
      storageKind: 'web-blob',
    });
    expect(asset.uri).toMatch(/^blob:/u);
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
  });

  it('does not use a bytes-per-millisecond estimate', async () => {
    await expect(repository().commitRaw(raw(600, 180_000))).resolves.toMatchObject({ byteSize: 600 });
  });

  it('rejects an empty or header-only browser recording', async () => {
    await expect(repository().commitRaw(raw(128, 2_000))).rejects.toMatchObject({ code: 'recording_file_incomplete' });
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it('rejects a mismatched or unknown Blob MIME type', async () => {
    await expect(repository().commitRaw(raw(600, 2_000, ''))).rejects.toMatchObject({ code: 'recording_file_incomplete' });
  });

  it('revokes only URLs belonging to committed assets', async () => {
    const repo = repository();
    const asset = await repo.commitRaw(raw(600));
    repo.discard({ ...asset, uri: 'blob:other' });
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    repo.discard(asset);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(asset.uri);
  });
});
