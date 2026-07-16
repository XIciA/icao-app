const mockFiles = new Map<string, number>();
const mockDirectories = new Map<string, number>();
let mockCopiedSize: number | undefined;

function mockJoinPath(first: { uri: string } | string, ...parts: string[]) {
  const base = typeof first === 'string' ? first : first.uri;
  return [base.replace(/\/$/, ''), ...parts.map((part) => part.replace(/^\//, ''))].join('/');
}

jest.mock('expo-file-system', () => {
  class MockDirectory {
    uri: string;

    constructor(first: MockDirectory | string, ...parts: string[]) {
      this.uri = mockJoinPath(first, ...parts);
    }

    get exists() { return mockDirectories.has(this.uri); }

    create() { mockDirectories.set(this.uri, Date.now()); }

    delete() {
      for (const key of [...mockFiles.keys()]) if (key.startsWith(`${this.uri}/`)) mockFiles.delete(key);
      for (const key of [...mockDirectories.keys()]) if (key === this.uri || key.startsWith(`${this.uri}/`)) mockDirectories.delete(key);
    }

    info() { return { modificationTime: mockDirectories.get(this.uri) ?? 0 }; }

    list() {
      const prefix = `${this.uri}/`;
      return [...mockDirectories.keys()]
        .filter((key) => key.startsWith(prefix) && !key.slice(prefix.length).includes('/'))
        .map((key) => new MockDirectory(key));
    }
  }

  class MockFile {
    uri: string;

    constructor(first: MockDirectory | MockFile | string, ...parts: string[]) {
      this.uri = mockJoinPath(first, ...parts);
    }

    get exists() { return mockFiles.has(this.uri); }
    get size() { return mockFiles.get(this.uri) ?? 0; }

    copy(destination: MockFile) { mockFiles.set(destination.uri, mockCopiedSize ?? this.size); }
    delete() { mockFiles.delete(this.uri); }
    move(destination: MockFile) {
      const size = this.size;
      mockFiles.delete(this.uri);
      mockFiles.set(destination.uri, size);
      this.uri = destination.uri;
    }
  }

  return {
    Directory: MockDirectory,
    File: MockFile,
    Paths: { cache: new MockDirectory('file:///cache') },
  };
});

jest.mock('@/platform/audio/audio-diagnostics', () => ({ emitAudioDiagnostic: jest.fn() }));

// Mock declarations must execute before the repository imports expo-file-system.
// eslint-disable-next-line import/first
import { RecordingRepository } from '../recording-repository';

describe('RecordingRepository', () => {
  beforeEach(() => {
    mockFiles.clear();
    mockDirectories.clear();
    mockCopiedSize = undefined;
    mockDirectories.set('file:///cache', Date.now());
  });

  function repository() {
    return new RecordingRepository({
      createId: () => 'asset-1',
      now: () => Date.parse('2026-07-16T00:00:00.000Z'),
      wait: async () => undefined,
    });
  }

  it('commits a verified raw file through a pending destination', async () => {
    mockFiles.set('file:///raw.wav', 64_000);

    const asset = await repository().commitRaw({
      cardId: 'card-1',
      durationMillis: 2_000,
      format: 'wav',
      minBytesPerMillisecond: 6.4,
      sessionId: 'session-1',
      uri: 'file:///raw.wav',
    });

    expect(asset).toEqual({
      byteSize: 64_000,
      cardId: 'card-1',
      createdAt: '2026-07-16T00:00:00.000Z',
      durationMillis: 2_000,
      format: 'wav',
      id: 'asset-1',
      sessionId: 'session-1',
      uri: 'file:///cache/icao-recordings/session-1/asset-1.wav',
    });
    expect(mockFiles.has('file:///raw.wav')).toBe(false);
    expect(mockFiles.has(`${asset.uri}.pending`)).toBe(false);
    expect(mockFiles.get(asset.uri)).toBe(64_000);
  });

  it('rejects a header-only file without deleting the raw source before commit succeeds', async () => {
    mockFiles.set('file:///header.wav', 4_096);

    await expect(repository().commitRaw({
      cardId: 'card-1',
      durationMillis: 3_000,
      format: 'wav',
      minBytesPerMillisecond: 6.4,
      sessionId: 'session-1',
      uri: 'file:///header.wav',
    })).rejects.toMatchObject({ code: 'recording_file_incomplete' });
    expect(mockFiles.has('file:///header.wav')).toBe(true);
  });

  it('rejects a partial pending copy without publishing a destination', async () => {
    mockFiles.set('file:///raw.wav', 64_000);
    mockCopiedSize = 32_000;

    await expect(repository().commitRaw({
      cardId: 'card-1',
      durationMillis: 2_000,
      format: 'wav',
      minBytesPerMillisecond: 6.4,
      sessionId: 'session-1',
      uri: 'file:///raw.wav',
    })).rejects.toMatchObject({ code: 'recording_commit_failed' });

    expect(mockFiles.has('file:///raw.wav')).toBe(true);
    expect(mockFiles.has('file:///cache/icao-recordings/session-1/asset-1.wav.pending')).toBe(false);
    expect(mockFiles.has('file:///cache/icao-recordings/session-1/asset-1.wav')).toBe(false);
  });

  it('only discards committed files owned by the repository', async () => {
    mockFiles.set('file:///raw.wav', 64_000);
    const repo = repository();
    const asset = await repo.commitRaw({ cardId: 'card-1', durationMillis: 2_000, format: 'wav', minBytesPerMillisecond: 6.4, sessionId: 'session-1', uri: 'file:///raw.wav' });
    repo.discard({ ...asset, uri: 'file:///someone-else.wav' });
    mockFiles.set('file:///someone-else.wav', 1);
    repo.discard({ ...asset, uri: 'file:///someone-else.wav' });
    expect(mockFiles.has('file:///someone-else.wav')).toBe(true);

    mockFiles.set('file:///cache/icao-recordings-elsewhere/asset.wav', 1);
    repo.discard({ ...asset, uri: 'file:///cache/icao-recordings-elsewhere/asset.wav' });
    expect(mockFiles.has('file:///cache/icao-recordings-elsewhere/asset.wav')).toBe(true);

    repo.discard(asset);
    expect(mockFiles.has(asset.uri)).toBe(false);
  });

  it('removes expired session directories but preserves recent sessions', () => {
    const now = Date.parse('2026-07-16T12:00:00.000Z');
    mockDirectories.set('file:///cache/icao-recordings', now);
    mockDirectories.set('file:///cache/icao-recordings/old', now - 25 * 60 * 60 * 1_000);
    mockDirectories.set('file:///cache/icao-recordings/recent', now - 60 * 60 * 1_000);

    repository().cleanupExpired(now);

    expect(mockDirectories.has('file:///cache/icao-recordings/old')).toBe(false);
    expect(mockDirectories.has('file:///cache/icao-recordings/recent')).toBe(true);
  });
});
