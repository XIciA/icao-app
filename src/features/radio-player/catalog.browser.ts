import { deriveRadioCatalogs, getEmbeddedRadioCatalogs, loadRadioCatalogDatasets, type RadioStudySelection } from './catalog.native';

export { deriveRadioCatalogs, getEmbeddedRadioCatalogs };

export async function loadRadioCatalogs(selection?: RadioStudySelection) {
  return deriveRadioCatalogs(await loadRadioCatalogDatasets(selection), selection);
}
