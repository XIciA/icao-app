import { createHash } from 'node:crypto';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const FORMATS = {
  'image/jpeg': { extension: 'jpg', matches: (buffer: Buffer) => buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff },
  'image/png': { extension: 'png', matches: (buffer: Buffer) => buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')) },
  'image/webp': { extension: 'webp', matches: (buffer: Buffer) => buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP' },
} as const;

export type FeedbackImage = {
  buffer: Buffer;
  mimeType: keyof typeof FORMATS;
  extension: string;
  checksum: string;
};

export function validateFeedbackImage(buffer: Buffer, mimeType: string, filename: string): FeedbackImage | undefined {
  if (buffer.length === 0 || buffer.length > MAX_IMAGE_BYTES) return undefined;
  const normalizedMime = mimeType.split(';', 1)[0]?.trim().toLowerCase() as keyof typeof FORMATS;
  const format = FORMATS[normalizedMime];
  if (!format || !format.matches(buffer)) return undefined;
  const filenameExtension = filename.includes('.') ? filename.split('.').pop()?.toLowerCase() : undefined;
  const allowedExtensions = normalizedMime === 'image/jpeg' ? ['jpg', 'jpeg'] : [format.extension];
  if (filenameExtension && !allowedExtensions.includes(filenameExtension)) return undefined;
  return {
    buffer,
    mimeType: normalizedMime,
    extension: format.extension,
    checksum: createHash('sha256').update(buffer).digest('hex'),
  };
}

export const feedbackImageLimits = {
  count: 3,
  fileSize: MAX_IMAGE_BYTES,
};

