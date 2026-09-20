import { contentChecksum } from './native-content-release.mjs';

function matches(data, file) {
  return data && data.size === file.sizeBytes;
}

async function verify(data, file) {
  if (!matches(data, file) || contentChecksum(Buffer.from(await data.arrayBuffer())) !== file.checksum) {
    throw new Error('immutable_resource_checksum_mismatch');
  }
}

/** A failed publication can leave immutable objects without catalog rows.
 * Read and verify those objects first: uploading again may block while the
 * storage gateway drains a rejected request body. Never overwrite an orphan. */
export async function ensureNativeContentResource(storage, file, bytes) {
  if (bytes.length !== file.sizeBytes || contentChecksum(bytes) !== file.checksum) {
    throw new Error('source_resource_checksum_mismatch');
  }
  const prior = await storage.download(file.objectKey);
  if (!prior.error) {
    await verify(prior.data, file);
    return 'reused';
  }
  if (Number(prior.error.statusCode ?? prior.error.status) !== 404) {
    throw new Error('resource_lookup_failed');
  }
  const uploaded = await storage.upload(file.objectKey, bytes, { contentType: file.mimeType, upsert: false });
  if (!uploaded.error) return 'uploaded';
  // Handle a concurrent publisher or an uncertain response after the server
  // stored the object. Only its complete expected bytes make this a success.
  const recovered = await storage.download(file.objectKey);
  if (recovered.error) throw new Error('immutable_resource_upload_failed');
  await verify(recovered.data, file);
  return 'reused';
}
