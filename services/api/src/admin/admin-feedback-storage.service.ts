import { Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { OPS_API_CONFIG, type OpsApiConfig } from '../config';
import { validateFeedbackImage } from '../feedback/feedback-image';

/** Reads only a DB-authorized feedback object; never returns storage credentials or URLs. */
@Injectable()
export class AdminFeedbackStorageService {
  constructor(@Inject(OPS_API_CONFIG) private readonly config: OpsApiConfig) {}

  async read(image: { objectKey: string; mimeType: string; sizeBytes: number; checksum: string }) {
    const { opsFeedbackStorageUrl, opsFeedbackStorageReadToken } = this.config;
    if (!opsFeedbackStorageUrl || !opsFeedbackStorageReadToken) {
      throw new ServiceUnavailableException('feedback_attachment_storage_unavailable');
    }
    if (!/^feedback\/[a-f0-9-]{36}\.(jpg|png|webp)$/iu.test(image.objectKey)
      || image.sizeBytes < 1 || image.sizeBytes > 5 * 1024 * 1024) {
      throw new ServiceUnavailableException('feedback_attachment_invalid');
    }
    try {
      const response = await fetch(`${opsFeedbackStorageUrl.replace(/\/$/u, '')}/object/authenticated/feedback-screenshots/${image.objectKey}`, {
        headers: { authorization: `Bearer ${opsFeedbackStorageReadToken}`, apikey: opsFeedbackStorageReadToken },
        signal: AbortSignal.timeout(10_000), redirect: 'error',
      });
      if (!response.ok || !response.body) throw new Error('storage_read_failed');
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let length = 0;
      try {
        while (true) {
          const next = await reader.read();
          if (next.done) break;
          length += next.value.byteLength;
          if (length > image.sizeBytes) throw new Error('storage_size_mismatch');
          chunks.push(next.value);
        }
      } finally { await reader.cancel().catch(() => undefined); }
      const bytes = Buffer.concat(chunks);
      if (bytes.length !== image.sizeBytes || createHash('sha256').update(bytes).digest('hex') !== image.checksum
        || !validateFeedbackImage(bytes, image.mimeType, image.objectKey.split('/').at(-1)!)) {
        throw new Error('storage_content_mismatch');
      }
      return bytes;
    } catch {
      throw new ServiceUnavailableException('feedback_attachment_read_failed');
    }
  }
}
