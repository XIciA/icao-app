import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { legalConsentMatches, type LegalConsentReceipt, type LegalConsentStatus } from '@icao/contracts/app-content';
import { and, eq, sql } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service';
import { userDocuments } from '../database/schema';
import { AppContentService } from './app-content.service';

export const LEGAL_CONSENT_DOCUMENT_KEY = 'legal-consent';

@Injectable()
export class LegalConsentService {
  constructor(private readonly database: DatabaseService, private readonly content: AppContentService) {}

  async status(accountId: string): Promise<LegalConsentStatus> {
    const [release, rows] = await Promise.all([
      this.content.get(),
      this.database.db.select({ payload: userDocuments.payload }).from(userDocuments)
        .where(and(eq(userDocuments.userId, accountId), eq(userDocuments.documentKey, LEGAL_CONSENT_DOCUMENT_KEY))).limit(1),
    ]);
    const receipt = (rows[0]?.payload ?? null) as LegalConsentReceipt | null;
    const { agreement, privacy } = release.payload.legal;
    return { accountId, releaseVersion: release.version, required: !legalConsentMatches(receipt, accountId, { agreement, privacy }), agreement, privacy, receipt };
  }

  async accept(accountId: string, input: unknown): Promise<LegalConsentReceipt> {
    const body = input as { agreementVersion?: unknown; privacyVersion?: unknown } | undefined;
    if (!body || typeof body.agreementVersion !== 'string' || typeof body.privacyVersion !== 'string'
      || body.agreementVersion.length > 80 || body.privacyVersion.length > 80) throw new BadRequestException('invalid_legal_consent');
    return this.database.db.transaction(async (tx) => {
      // Serialize against atomic content publication so the receipt names the version actually accepted.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext('app_content_publish'))`);
      const release = await this.content.get(tx);
      const { agreement, privacy } = release.payload.legal;
      if (body.agreementVersion !== agreement.version || body.privacyVersion !== privacy.version) throw new ConflictException('legal_version_changed');
      const receipt: LegalConsentReceipt = {
        accountId, agreementVersion: agreement.version, privacyVersion: privacy.version,
        agreementConsentVersion: agreement.consentVersion, privacyConsentVersion: privacy.consentVersion,
        releaseVersion: release.version, acceptedAt: new Date().toISOString(),
      };
      await tx.insert(userDocuments).values({ userId: accountId, documentKey: LEGAL_CONSENT_DOCUMENT_KEY, payload: receipt })
        .onConflictDoUpdate({ target: [userDocuments.userId, userDocuments.documentKey], set: {
          payload: receipt, version: sql`${userDocuments.version} + 1`, updatedAt: new Date(),
        } });
      return receipt;
    });
  }
}
