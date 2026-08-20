type MockFileEntry = { bytes: Uint8Array; growth?: Uint8Array[] };

const mockFiles = new Map<string, MockFileEntry>();
const mockDirectories = new Map<string, number>();
let mockCopiedSize: number | undefined;

function mockJoinPath(first: { uri: string } | string, ...parts: string[]) {
  const base = typeof first === 'string' ? first : first.uri;
  return [base.replace(/\/$/, ''), ...parts.map((part) => part.replace(/^\//, ''))].join('/');
}

jest.mock('expo-file-system', () => {
  class MockDirectory {
    uri: string;
    constructor(first: MockDirectory | string, ...parts: string[]) { this.uri = mockJoinPath(first, ...parts); }
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
    constructor(first: MockDirectory | MockFile | string, ...parts: string[]) { this.uri = mockJoinPath(first, ...parts); }
    get exists() { return mockFiles.has(this.uri); }
    get size() {
      const entry = mockFiles.get(this.uri);
      if (!entry) return 0;
      const next = entry.growth?.shift();
      if (next) entry.bytes = next;
      return entry.bytes.length;
    }
    bytesSync() { return new Uint8Array(mockFiles.get(this.uri)?.bytes ?? []); }
    copy(destination: MockFile) {
      const bytes = this.bytesSync();
      mockFiles.set(destination.uri, { bytes: bytes.slice(0, mockCopiedSize ?? bytes.length) });
    }
    delete() { mockFiles.delete(this.uri); }
    move(destination: MockFile) {
      const entry = mockFiles.get(this.uri);
      mockFiles.delete(this.uri);
      if (entry) mockFiles.set(destination.uri, entry);
      this.uri = destination.uri;
    }
  }
  return { Directory: MockDirectory, File: MockFile, Paths: { cache: new MockDirectory('file:///cache') } };
});

jest.mock('@/platform/audio/audio-diagnostics', () => ({ emitAudioDiagnostic: jest.fn() }));

// eslint-disable-next-line import/first
import { RecordingRepository } from '../recording-repository';

function text(bytes: Uint8Array, offset: number, value: string) {
  for (let index = 0; index < value.length; index += 1) bytes[offset + index] = value.charCodeAt(index);
}

function wave(dataBytes: number) {
  const bytes = new Uint8Array(44 + dataBytes);
  const view = new DataView(bytes.buffer);
  text(bytes, 0, 'RIFF');
  view.setUint32(4, bytes.length - 8, true);
  text(bytes, 8, 'WAVE');
  text(bytes, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 16_000, true);
  view.setUint32(28, 32_000, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(bytes, 36, 'data');
  view.setUint32(40, dataBytes, true);
  return bytes;
}

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

  it('commits a container-verified raw file through a pending destination', async () => {
    mockFiles.set('file:///raw.wav', { bytes: wave(64_000) });
    const asset = await repository().commitRaw({ cardId: 'card-1', durationMillis: 2_000, format: 'wav', sessionId: 'session-1', uri: 'file:///raw.wav' });
    expect(asset).toMatchObject({ byteSize: 64_044, format: 'wav', id: 'asset-1' });
    expect(mockFiles.has('file:///raw.wav')).toBe(false);
    expect(mockFiles.get(asset.uri)?.bytes.length).toBe(64_044);
  });

  it('waits for delayed native finalization instead of accepting the first stable small file', async () => {
    const partial = wave(0);
    const complete = wave(32_000);
    mockFiles.set('file:///delayed.wav', { bytes: partial, growth: [partial, partial, complete, complete] });
    const asset = await repository().commitRaw({ cardId: 'card-1', durationMillis: 1_000, format: 'wav', sessionId: 'session-1', uri: 'file:///delayed.wav' });
    expect(asset.byteSize).toBe(32_044);
  });

  it('distinguishes missing, invalid-container, and incomplete files', async () => {
    await expect(repository().commitRaw({ cardId: 'card-1', durationMillis: 2_000, format: 'wav', sessionId: 'session-1', uri: 'file:///missing.wav' })).rejects.toMatchObject({ code: 'recording_source_missing' });
    mockFiles.set('file:///invalid.wav', { bytes: new Uint8Array(512) });
    await expect(repository().commitRaw({ cardId: 'card-1', durationMillis: 2_000, format: 'wav', sessionId: 'session-1', uri: 'file:///invalid.wav' })).rejects.toMatchObject({ code: 'recording_container_invalid' });
    mockFiles.set('file:///header.wav', { bytes: wave(0) });
    await expect(repository().commitRaw({ cardId: 'card-1', durationMillis: 2_000, format: 'wav', sessionId: 'session-1', uri: 'file:///header.wav' })).rejects.toMatchObject({ code: 'recording_file_incomplete' });
  });

  it('rejects a partial pending copy without publishing a destination', async () => {
    mockFiles.set('file:///raw.wav', { bytes: wave(64_000) });
    mockCopiedSize = 32_000;
    await expect(repository().commitRaw({ cardId: 'card-1', durationMillis: 2_000, format: 'wav', sessionId: 'session-1', uri: 'file:///raw.wav' })).rejects.toMatchObject({ code: 'recording_commit_failed' });
    expect(mockFiles.has('file:///raw.wav')).toBe(true);
    expect(mockFiles.has('file:///cache/icao-recordings/session-1/asset-1.wav.pending')).toBe(false);
    expect(mockFiles.has('file:///cache/icao-recordings/session-1/asset-1.wav')).toBe(false);
  });

  it('only discards committed files owned by the repository', async () => {
    mockFiles.set('file:///raw.wav', { bytes: wave(64_000) });
    const repo = repository();
    const asset = await repo.commitRaw({ cardId: 'card-1', durationMillis: 2_000, format: 'wav', sessionId: 'session-1', uri: 'file:///raw.wav' });
    mockFiles.set('file:///someone-else.wav', { bytes: new Uint8Array(1) });
    repo.discard({ ...asset, uri: 'file:///someone-else.wav' });
    expect(mockFiles.has('file:///someone-else.wav')).toBe(true);
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
