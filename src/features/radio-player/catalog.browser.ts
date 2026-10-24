import type { RadioBankId } from './types';
import { deriveRadioCatalogs, getEmbeddedRadioCatalogs, loadRadioCatalogDatasets, type RadioStudySelection } from './catalog.native';

export { deriveRadioCatalogs, getEmbeddedRadioCatalogs };

export async function loadRadioCatalogs(selection?: RadioStudySelection, bankId?: RadioBankId, isCurrent?: () => boolean) {
  return deriveRadioCatalogs(await loadRadioCatalogDatasets(selection, { complete: true, bankId, isCurrent }), selection);
}
