import { createHmac } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import { API_CONFIG, type ApiConfig } from '../config';

const GRANT_TTL_MS = 10 * 60 * 1_000;

@Injectable()
export class RecentSocialAuthGrantService {
  private readonly grants = new Map<string, number>();

  constructor(@Inject(API_CONFIG) private readonly config: ApiConfig) {}

  issue(provider: 'wechat', authUserId: string, sessionId: string, now = Date.now()) {
    this.cleanup(now);
    this.grants.set(this.key(provider, authUserId, sessionId), now + GRANT_TTL_MS);
  }

  has(provider: 'wechat', authUserId: string, sessionId: string, now = Date.now()) {
    this.cleanup(now);
    return (this.grants.get(this.key(provider, authUserId, sessionId)) ?? 0) > now;
  }

  consume(provider: 'wechat', authUserId: string, sessionId: string, now = Date.now()) {
    const key = this.key(provider, authUserId, sessionId);
    const valid = this.has(provider, authUserId, sessionId, now);
    if (valid) this.grants.delete(key);
    return valid;
  }

  private key(provider: 'wechat', authUserId: string, sessionId: string) {
    return createHmac('sha256', this.config.accountIdentityHashSecret)
      .update(`recent-social-auth-v1\0${provider}\0${authUserId}\0${sessionId}`)
      .digest('hex');
  }

  private cleanup(now: number) {
    for (const [key, expiresAt] of this.grants) {
      if (expiresAt <= now) this.grants.delete(key);
    }
  }
}
