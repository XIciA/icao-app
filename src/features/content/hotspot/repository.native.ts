import { normalizeDailyHotspots } from '@icao/contracts/app-content';
import { builtinAppContent, loadAppContent } from '@/features/app-content/repository.native';
import type { OpiHotspotBrief } from './types';

let briefs: OpiHotspotBrief[] = normalizeDailyHotspots(builtinAppContent.hotspots.briefs);
export function loadHotspotBriefs() { return briefs; }
export function getHotspotBrief(briefId: string) { return briefs.find((brief) => brief.id === briefId || brief.sources?.some(source=>source.id===briefId)); }
export async function refreshHotspotDirectory() {
  const release = await loadAppContent();
  briefs = normalizeDailyHotspots(release.data.payload.hotspots.briefs);
  return { briefs, warning: release.warning };
}
export async function refreshHotspotBriefs() { return (await refreshHotspotDirectory()).briefs; }
export async function loadHotspotBrief(briefId: string) {
  const result = await refreshHotspotDirectory();
  const brief = result.briefs.find((brief) => brief.id === briefId || brief.sources?.some(source=>source.id===briefId));
  if (!brief && result.warning) throw new Error('hotspot_directory_unavailable');
  return brief;
}
