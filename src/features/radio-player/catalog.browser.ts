import type { QuestionBankDataset } from '@/features/question-bank/types';
import type { RadioBankId } from './types';
import { deriveRadioCatalogs, getEmbeddedRadioCatalogs, loadRadioCatalogDatasets, type RadioStudySelection } from './catalog.native';

export { deriveRadioCatalogs, getEmbeddedRadioCatalogs };

export async function loadRadioCatalogs(selection?: RadioStudySelection, bankId?: RadioBankId, isCurrent?: () => boolean, onProgress?: (catalogs: ReturnType<typeof deriveRadioCatalogs>) => void, getPriorityBankId?: () => RadioBankId, progress?: { previousDatasets?: QuestionBankDataset[]; onDatasets: (datasets: QuestionBankDataset[]) => void }) {
  return deriveRadioCatalogs(await loadRadioCatalogDatasets(selection, { complete: true, bankId, getPriorityBankId, isCurrent, previousDatasets: progress?.previousDatasets, onProgress: datasets => { progress?.onDatasets(datasets); onProgress?.(deriveRadioCatalogs(datasets, selection)); } }), selection);
}
