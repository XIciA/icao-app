import type { buildSentencesPdf } from './sentences-pdf';
/** Keep the PDF engine out of the initial screen bundle. */
export async function generateSentencesPdf(...args: Parameters<typeof buildSentencesPdf>) {
  const engine = await import('./sentences-pdf');
  return engine.buildSentencesPdf(...args);
}
