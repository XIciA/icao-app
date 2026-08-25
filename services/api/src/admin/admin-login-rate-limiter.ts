import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import { isIP } from 'node:net';
import { timingSafeEqual } from 'node:crypto';

import { OPS_API_CONFIG, type OpsApiConfig } from '../config';
import { hashOpsSecret } from './admin-crypto';
import type { OpsAuthenticatedRequest } from './admin.types';

const SOURCE_WINDOW_MS = 10 * 60 * 1_000;
const SOURCE_MAX_ATTEMPTS = 8;
const GLOBAL_WINDOW_MS = 60 * 1_000;
const GLOBAL_MAX_ATTEMPTS = 200;
const MAX_SOURCE_BUCKETS = 4_096;

type Bucket = { count: number; expiresAt: number };

function headerValue(value: string | string[] | undefined) {
  return typeof value === 'string' ? value.trim() : undefined;
}

function normalizeAddress(value: string | undefined) {
  if (!value) return 'unknown';
  const normalized = value.startsWith('::ffff:') ? value.slice(7) : value;
  return isIP(normalized) ? normalized : 'unknown';
}

function isLoopback(value: string) {
  return value === '127.0.0.1' || value === '::1';
}

function secretsMatch(actual: string | undefined, expected: string | undefined) {
  if (!actual || !expected) return false;
  const actualBytes = Buffer.from(actual);
  const expectedBytes = Buffer.from(expected);
  return actualBytes.byteLength === expectedBytes.byteLength
    && timingSafeEqual(actualBytes, expectedBytes);
}

/**
 * Resolve the login source without trusting generic forwarding headers.
 * Caddy may supply its own client address only over loopback and only together
 * with a server-held shared secret. Direct or malformed requests fall back to
 * the actual TCP peer.
 */
export function opsLoginSource(
  request: OpsAuthenticatedRequest,
  trustedProxySharedSecret: string | undefined,
) {
  const peer = normalizeAddress(request.raw?.socket.remoteAddress ?? request.ip);
  const proxySecret = headerValue(request.headers['x-ops-proxy-secret']);
  const forwarded = normalizeAddress(headerValue(request.headers['x-ops-client-ip']));
  if (
    isLoopback(peer)
    && forwarded !== 'unknown'
    && secretsMatch(proxySecret, trustedProxySharedSecret)
  ) return forwarded;
  return peer;
}

/**
 * Bounded, single-process login protection for the first Ops release.
 * It limits both one source and total scrypt/database work. New source keys are
 * rejected once capacity is full rather than evicting existing protections.
 */
@Injectable()
export class OpsLoginRateLimiter {
  private readonly sources = new Map<string, Bucket>();
  private global: Bucket = { count: 0, expiresAt: 0 };

  constructor(@Inject(OPS_API_CONFIG) private readonly config: OpsApiConfig) {}

  assertAllowed(source: string, now = Date.now()) {
    const sourceSecret = this.config.opsSessionHashSecret;
    const sourceKey = hashOpsSecret(source, sourceSecret, 'ops-login-source-v1');
    const existing = this.sources.get(sourceKey);
    if (existing && existing.expiresAt > now && existing.count >= SOURCE_MAX_ATTEMPTS) {
      this.reject();
    }
    if (this.global.expiresAt > now && this.global.count >= GLOBAL_MAX_ATTEMPTS) {
      this.reject();
    }

    if (!existing || existing.expiresAt <= now) {
      this.prune(now);
      if (!this.sources.has(sourceKey) && this.sources.size >= MAX_SOURCE_BUCKETS) this.reject();
      this.sources.set(sourceKey, { count: 1, expiresAt: now + SOURCE_WINDOW_MS });
    } else {
      existing.count += 1;
    }
    if (this.global.expiresAt <= now) {
      this.global = { count: 1, expiresAt: now + GLOBAL_WINDOW_MS };
    } else {
      this.global.count += 1;
    }
  }

  sizeForTesting() {
    return this.sources.size;
  }

  private prune(now: number) {
    for (const [key, bucket] of this.sources) {
      if (bucket.expiresAt <= now) this.sources.delete(key);
    }
  }

  private reject(): never {
    // The code matches every other credential failure; only the source's rate
    // state changes the HTTP status, never whether an email exists.
    throw new HttpException('invalid_ops_credentials', HttpStatus.TOO_MANY_REQUESTS);
  }
}
