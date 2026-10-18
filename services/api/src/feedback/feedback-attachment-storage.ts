import { Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { API_CONFIG, type ApiConfig } from '../config';
import type { FeedbackImage } from './feedback-image';

const BUCKET = 'feedback-screenshots';
const PREFIX = 'feedback';

export type StoredFeedbackImage = FeedbackImage & {
  objectKey: string;
};

@Injectable()
export class FeedbackAttachmentStorage {
  private readonly storage: SupabaseClient;

  constructor(@Inject(API_CONFIG) config: ApiConfig) {
    this.storage = createClient(config.supabaseUrl, config.supabaseSecretKey, {
      auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
    });
  }

  async upload(images: FeedbackImage[]): Promise<StoredFeedbackImage[]> {
    const bucket = this.storage.storage.from(BUCKET);
    const stored: StoredFeedbackImage[] = [];
    try {
      for (const image of images) {
        const objectKey = `${PREFIX}/${randomUUID()}.${image.extension}`;
        const result = await bucket.upload(objectKey, image.buffer, {
          contentType: image.mimeType,
          upsert: false,
        });
        if (result.error) throw new ServiceUnavailableException('feedback_storage_failed');
        stored.push({ ...image, objectKey });
      }
      return stored;
    } catch (error) {
      await this.remove(stored.map((image) => image.objectKey)).catch(() => undefined);
      throw error;
    }
  }

  async signedUrl(objectKey: string) {
    const result = await this.storage.storage.from(BUCKET).createSignedUrl(objectKey, 300);
    if (result.error || !result.data) throw new ServiceUnavailableException('feedback_image_unavailable');
    return result.data.signedUrl;
  }

  async remove(objectKeys: string[]) {
    if (objectKeys.length === 0) return;
    const result = await this.storage.storage.from(BUCKET).remove(objectKeys);
    if (result.error) throw new ServiceUnavailableException('feedback_cleanup_failed');
  }

  async listOldest(limit = 1_000) {
    const result = await this.storage.storage.from(BUCKET).list(PREFIX, {
      limit,
      offset: 0,
      sortBy: { column: 'created_at', order: 'asc' },
    });
    if (result.error) throw new ServiceUnavailableException('feedback_cleanup_list_failed');
    return (result.data ?? []).flatMap((entry) => entry.created_at
      ? [{ objectKey: `${PREFIX}/${entry.name}`, createdAt: new Date(entry.created_at) }]
      : []);
  }
}

