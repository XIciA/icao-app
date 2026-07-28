/**
 * Repository for loading and querying OPI hotspot briefing data.
 *
 * Reads the embedded opi-hotspots.json index and provides
 * typed access to briefings sorted by date (most recent first).
 */

import hotspotIndex from '@/../content/question-banks/opi-hotspots.json';

import type { OpiHotspotBrief, OpiHotspotIndex } from './types';

const index = hotspotIndex as OpiHotspotIndex;

/** All briefings sorted by date descending (most recent first). */
export function loadHotspotBriefs(): OpiHotspotBrief[] {
  return [...index.briefs].sort((a, b) => b.date.localeCompare(a.date));
}

/** Find a single briefing by its ID. */
export function findHotspotBrief(id: string): OpiHotspotBrief | undefined {
  return index.briefs.find((brief) => brief.id === id);
}
