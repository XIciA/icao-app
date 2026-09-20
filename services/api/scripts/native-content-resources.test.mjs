import { describe, expect, it, vi } from 'vitest';
import { contentChecksum } from './native-content-release.mjs';
import { ensureNativeContentResource } from './native-content-resources.mjs';

const bytes = Buffer.from('immutable content');
const file = { objectKey: 'revisions/test/asset.mp3', sizeBytes: bytes.length, checksum: contentChecksum(bytes), mimeType: 'audio/mpeg' };
const found = () => ({ data: new Blob([bytes]), error: null });
const absent = { data: null, error: { status: 400, statusCode: '404' } };
const storage = () => ({ download: vi.fn(), upload: vi.fn() });

describe('resumable immutable content resources', () => {
  it('reuses a verified orphan without sending another upload', async () => {
    const s = storage(); s.download.mockResolvedValue(found());
    await expect(ensureNativeContentResource(s, file, bytes)).resolves.toBe('reused');
    expect(s.upload).not.toHaveBeenCalled();
  });
  it('uploads a missing object without allowing overwrite', async () => {
    const s = storage(); s.download.mockResolvedValue(absent); s.upload.mockResolvedValue({ error: null });
    await expect(ensureNativeContentResource(s, file, bytes)).resolves.toBe('uploaded');
    expect(s.upload).toHaveBeenCalledWith(file.objectKey, bytes, { contentType: file.mimeType, upsert: false });
  });
  it('rejects different bytes at an existing immutable path', async () => {
    const s = storage(); s.download.mockResolvedValue({ data: new Blob([Buffer.alloc(bytes.length)]), error: null });
    await expect(ensureNativeContentResource(s, file, bytes)).rejects.toThrow('immutable_resource_checksum_mismatch');
    expect(s.upload).not.toHaveBeenCalled();
  });
  it.each([401, 403, 500])('does not treat lookup failure %s as missing', async (status) => {
    const s = storage(); s.download.mockResolvedValue({ data: null, error: { status } });
    await expect(ensureNativeContentResource(s, file, bytes)).rejects.toThrow('resource_lookup_failed');
    expect(s.upload).not.toHaveBeenCalled();
  });
  it('recovers an uncertain upload only after verifying the stored bytes', async () => {
    const s = storage(); s.download.mockResolvedValueOnce(absent).mockResolvedValueOnce(found());
    s.upload.mockResolvedValue({ error: new Error('connection closed after storing') });
    await expect(ensureNativeContentResource(s, file, bytes)).resolves.toBe('reused');
    expect(s.download).toHaveBeenCalledTimes(2);
  });
  it('fails when neither upload nor recovery succeeded', async () => {
    const s = storage(); s.download.mockResolvedValue(absent); s.upload.mockResolvedValue({ error: new Error('offline') });
    await expect(ensureNativeContentResource(s, file, bytes)).rejects.toThrow('immutable_resource_upload_failed');
  });
  it('rejects invalid local content before any network request', async () => {
    const s = storage();
    await expect(ensureNativeContentResource(s, file, Buffer.from('wrong'))).rejects.toThrow('source_resource_checksum_mismatch');
    expect(s.download).not.toHaveBeenCalled();
  });
});
