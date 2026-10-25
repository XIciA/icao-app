import type { RadioBankId } from './types';
import { deriveRadioCatalogs, getEmbeddedRadioCatalogs, loadRadioCatalogDatasets, type RadioStudySelection } from './catalog.native';

export { deriveRadioCatalogs, getEmbeddedRadioCatalogs };

export async function loadRadioCatalogs(selection?: RadioStudySelection, bankId?: RadioBankId, isCurrent?: () => boolean, onProgress?: (catalogs: ReturnType<typeof deriveRadioCatalogs>) => void, getPriorityBankId?: () => RadioBankId) {
  return deriveRadioCatalogs(await loadRadioCatalogDatasets(selection, { complete: true, bankId, getPriorityBankId, isCurrent, onProgress: datasets => onProgress?.(deriveRadioCatalogs(datasets, selection)) }), selection);
}
