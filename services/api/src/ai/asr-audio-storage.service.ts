import { Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { API_CONFIG, type ApiConfig } from '../config';

export type StagedAsrAudio = { objectKey: string; url: string };

const EXTENSIONS: Record<string, string> = {
  'audio/aac': 'aac',
  'audio/m4a': 'm4a',
  'audio/mp4': 'm4a',
  'audio/mpeg': 'mp3',
  'audio/ogg': 'ogg',
  'audio/wav': 'wav',
  'audio/webm': 'webm',
};

const MIME_ALIASES: Record<string, string> = {
  'audio/vnd.wave': 'audio/wav',
  'audio/wave': 'audio/wav',
  'audio/x-m4a': 'audio/mp4',
  'audio/x-pn-wav': 'audio/wav',
  'audio/x-wav': 'audio/wav',
};

export function resolveAsrAudioFormat(mimeType: string) {
  const reportedType = mimeType.split(';', 1)[0]?.trim().toLowerCase() || 'application/octet-stream';
  const contentType = MIME_ALIASES[reportedType] ?? reportedType;
  return { contentType, extension: EXTENSIONS[contentType] ?? 'audio' };
}

@Injectable()
export class AsrAudioStorageService {
  private readonly storage: SupabaseClient;
  private readonly internalUrl: string;
  private readonly publicUrl: string;
  private readonly bucket: string;
  private readonly signedUrlTtlSeconds: number;
  private readonly staleAudioTtlSeconds: number;
  private lastCleanupAt = 0;

  constructor(@Inject(API_CONFIG) config: ApiConfig) {
    this.internalUrl = config.supabaseUrl.replace(/\/+$/, '');
    this.publicUrl = config.supabasePublicUrl.replace(/\/+$/, '');
    this.bucket = config.aiAsrStagingBucket;
    this.signedUrlTtlSeconds = config.aiAsrSignedUrlTtlSeconds;
    this.staleAudioTtlSeconds = config.aiAsrStaleAudioTtlSeconds;
    this.storage = createClient(config.supabaseUrl, config.supabaseSecretKey, {
      auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
    });
  }

  async stage(audio: Buffer, mimeType: string): Promise<StagedAsrAudio> {
    const { contentType, extension } = resolveAsrAudioFormat(mimeType);
    const objectKey = `${Date.now()}-${randomUUID()}.${extension}`;
    const bucket = this.storage.storage.from(this.bucket);
    const uploaded = await bucket.upload(objectKey, audio, { contentType, upsert: false });
    if (uploaded.error) throw new ServiceUnavailableException('asr_audio_upload_failed');
    const signed = await bucket.createSignedUrl(objectKey, this.signedUrlTtlSeconds);
    if (signed.error || !signed.data.signedUrl) {
      await bucket.remove([objectKey]).catch(() => undefined);
      throw new ServiceUnavailableException('asr_audio_signing_failed');
    }
    void this.cleanupStale().catch(() => undefined);
    return { objectKey, url: signed.data.signedUrl.replace(this.internalUrl, this.publicUrl) };
  }

  async remove(objectKey: string) {
    const removed = await this.storage.storage.from(this.bucket).remove([objectKey]);
    if (removed.error) throw new ServiceUnavailableException('asr_audio_cleanup_failed');
  }

  async cleanupStale() {
    const now = Date.now();
    if (now - this.lastCleanupAt < 60 * 60 * 1000) return;
    this.lastCleanupAt = now;
    const bucket = this.storage.storage.from(this.bucket);
    const listed = await bucket.list('', { limit: 100, sortBy: { column: 'created_at', order: 'asc' } });
    if (listed.error) return;
    const cutoff = now - this.staleAudioTtlSeconds * 1000;
    const stale = (listed.data ?? [])
      .filter((entry) => entry.created_at && Date.parse(entry.created_at) < cutoff)
      .map((entry) => entry.name);
    if (stale.length > 0) await bucket.remove(stale);
  }
}
