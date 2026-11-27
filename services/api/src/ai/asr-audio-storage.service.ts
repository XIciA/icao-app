import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
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

const STALE_CLEANUP_INTERVAL_MILLISECONDS = 60 * 60 * 1_000;

export function resolveAsrAudioFormat(mimeType: string) {
  const reportedType = mimeType.split(';', 1)[0]?.trim().toLowerCase() || 'application/octet-stream';
  const contentType = MIME_ALIASES[reportedType] ?? reportedType;
  return { contentType, extension: EXTENSIONS[contentType] ?? 'audio' };
}

@Injectable()
export class AsrAudioStorageService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AsrAudioStorageService.name);
  private readonly storage: SupabaseClient;
  private readonly internalUrl: string;
  private readonly publicUrl: string;
  private readonly bucket: string;
  private readonly signedUrlTtlSeconds: number;
  private readonly staleAudioTtlSeconds: number;
  private readonly nodeEnv: string;
  private lastCleanupAt = 0;
  private cleanupTimer?: NodeJS.Timeout;

  constructor(@Inject(API_CONFIG) config: ApiConfig) {
    this.internalUrl = config.supabaseUrl.replace(/\/+$/, '');
    this.publicUrl = config.supabasePublicUrl.replace(/\/+$/, '');
    this.bucket = config.aiAsrStagingBucket;
    this.signedUrlTtlSeconds = config.aiAsrSignedUrlTtlSeconds;
    this.staleAudioTtlSeconds = config.aiAsrStaleAudioTtlSeconds;
    this.nodeEnv = config.nodeEnv;
    this.storage = createClient(config.supabaseUrl, config.supabaseSecretKey, {
      auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
    });
  }

  onModuleInit() {
    if (this.nodeEnv === 'test') return;
    this.cleanupTimer = setInterval(() => { void this.runScheduledCleanup(); }, STALE_CLEANUP_INTERVAL_MILLISECONDS);
    this.cleanupTimer.unref();
    void this.runScheduledCleanup();
  }

  onModuleDestroy() {
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
  }

  private async runScheduledCleanup() {
    await this.cleanupStale().catch(() => this.logger.warn('asr_audio_stale_cleanup_failed'));
  }

  async stage(audio: Buffer, mimeType: string, correlationId?: string): Promise<StagedAsrAudio> {
    const { contentType, extension } = resolveAsrAudioFormat(mimeType);
    const safeCorrelationId = correlationId?.replace(/[^A-Za-z0-9_-]/gu, '').slice(0, 80);
    const objectKey = safeCorrelationId
      ? `${safeCorrelationId}-${randomUUID()}.${extension}`
      : `${Date.now()}-${randomUUID()}.${extension}`;
    const bucket = this.storage.storage.from(this.bucket);
    const uploaded = await bucket.upload(objectKey, audio, { contentType, upsert: false });
    if (uploaded.error) throw new ServiceUnavailableException('asr_audio_upload_failed');
    const signed = await bucket.createSignedUrl(objectKey, this.signedUrlTtlSeconds);
    if (signed.error || !signed.data.signedUrl) {
      await bucket.remove([objectKey]).catch(() => this.logger.warn('asr_audio_cleanup_failed stage=signing'));
      throw new ServiceUnavailableException('asr_audio_signing_failed');
    }
    void this.runScheduledCleanup();
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
    const cutoff = now - this.staleAudioTtlSeconds * 1000;
    for (let page = 0; page < 10; page += 1) {
      // Always re-read the oldest page after deletion. This avoids skipping
      // objects as the bucket shrinks and keeps the operation bounded.
      const listed = await bucket.list('', { limit: 100, sortBy: { column: 'created_at', order: 'asc' } });
      if (listed.error) throw new ServiceUnavailableException('asr_audio_cleanup_list_failed');
      const entries = listed.data ?? [];
      const stale = entries
        .filter((entry) => entry.created_at && Date.parse(entry.created_at) < cutoff)
        .map((entry) => entry.name);
      if (stale.length === 0) return;
      const removed = await bucket.remove(stale);
      if (removed.error) throw new ServiceUnavailableException('asr_audio_cleanup_failed');
      if (entries.length < 100) return;
    }
    this.logger.warn('asr_audio_stale_cleanup_incomplete max_objects=1000');
  }
}
