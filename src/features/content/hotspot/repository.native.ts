import { builtinAppContent, loadAppContent } from '@/features/app-content/repository.native';
import type { OpiHotspotBrief } from './types';

let briefs: OpiHotspotBrief[] = [...builtinAppContent.hotspots.briefs].sort((a, b) => b.date.localeCompare(a.date));
export function loadHotspotBriefs() { return briefs; }
export function getHotspotBrief(briefId: string) { return briefs.find((brief) => brief.id === briefId); }
export async function refreshHotspotBriefs() {
  const release = await loadAppContent();
  briefs = [...release.data.payload.hotspots.briefs].sort((a, b) => b.date.localeCompare(a.date));
  return briefs;
}
export async function loadHotspotBrief(briefId: string) {
  const current = await refreshHotspotBriefs();
  return current.find((brief) => brief.id === briefId);
}
