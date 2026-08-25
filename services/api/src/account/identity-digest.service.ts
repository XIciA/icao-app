import { createHmac } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import type { AuthIdentityProvider } from '@icao/contracts';

import { API_CONFIG, type ApiConfig } from '../config';

export type VersionedIdentityDigest = {
  digest: string;
  version: number;
};

type DigestDomain = 'apple-revocable-credential-v1' | 'lifetime-benefit-v1';
type IdentityDigestConfig = Pick<ApiConfig, 'accountIdentityHashSecret'> & Partial<Pick<
  ApiConfig,
  | 'identityBenefitDigestKeyVersion'
  | 'identityBenefitDigestPreviousKeys'
  | 'identityBenefitDigestSecret'
>>;

@Injectable()
export class IdentityDigestService {
  private readonly keys: Array<{ secret: string; version: number }>;

  constructor(@Inject(API_CONFIG) config: IdentityDigestConfig) {
    this.keys = [{
      secret: config.identityBenefitDigestSecret ?? config.accountIdentityHashSecret,
      version: config.identityBenefitDigestKeyVersion ?? 1,
    }, ...(config.identityBenefitDigestPreviousKeys ?? [])];
  }

  current(domain: DigestDomain, provider: AuthIdentityProvider, subject: string) {
    return this.forKey(this.keys[0]!, domain, provider, subject);
  }

  candidates(domain: DigestDomain, provider: AuthIdentityProvider, subject: string) {
    return this.keys.map((key) => this.forKey(key, domain, provider, subject));
  }

  accountContext(accountId: string) {
    const current = this.keys[0]!;
    return createHmac('sha256', current.secret)
      .update(`lifetime-benefit-account-context-v1\0${accountId}`)
      .digest('hex');
  }

  private forKey(
    key: { secret: string; version: number },
    domain: DigestDomain,
    provider: AuthIdentityProvider,
    subject: string,
  ): VersionedIdentityDigest {
    return {
      digest: createHmac('sha256', key.secret)
        .update(`${domain}\0${provider}\0${subject}`)
        .digest('hex'),
      version: key.version,
    };
  }
}
