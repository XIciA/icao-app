import { vocabularyDocumentForLegacyClient } from '@icao/contracts';
import { vocabularyDocumentSchema } from './vocabulary-document';

export function vocabularyPayloadForClient<T>(payload: T, catalog: unknown): T {
  if (catalog === 'three-books-v3' || !payload || typeof payload !== 'object') return payload;
  const value = payload as Record<string, unknown>;
  if (value.documentKey !== 'vocabulary') return payload;
  const parsed = vocabularyDocumentSchema.safeParse(value.document);
  return parsed.success ? { ...value, document:vocabularyDocumentForLegacyClient(parsed.data) } as T : payload;
}
