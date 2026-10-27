import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

const relations = brief => brief.topics.flatMap(t => t.cardIds.map(id => `${t.topicId}/${id}`)).sort();
// These legacy category labels are not examination centers.
const nonCenters = new Set(['综合反馈', '多考点反馈', '冬季运行专题']);
const centers = brief => [...new Set(brief.centers.filter(c => !nonCenters.has(c)))].sort();

/** Restore proven provenance only. Never replace legal/help or guess a card's center. */
export function restoreHotspotSources(current, historical) {
  const next = structuredClone(current);
  const restored = [];
  for (const old of historical.hotspots.briefs.filter(b => b.sources?.length)) {
    const matches = next.hotspots.briefs.filter(b => b.date === old.date);
    const target = matches.length === 1 ? matches[0] : undefined;
    if (!target) throw new Error('historical_hotspot_missing_from_current');
    if (target.id !== old.id && !old.sources.some(s => s.id === target.id)) throw new Error('historical_hotspot_identity_changed');
    if (target.sources?.length) continue;
    if (!isDeepStrictEqual(relations(target), relations(old)) || !isDeepStrictEqual(centers(target), centers(old))) {
      throw new Error('hotspot_changed_requires_relation_merge');
    }
    target.sources = structuredClone(old.sources);
    restored.push(target.id);
  }
  const proof = structuredClone(next);
  for (const id of restored) delete proof.hotspots.briefs.find(b => b.id === id).sources;
  if (!isDeepStrictEqual(proof, current)) throw new Error('unrelated_content_changed');
  return { payload: next, restored };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [currentFile, historyFile, output] = process.argv.slice(2);
  if (!output) throw new Error('usage: restore-hotspot-sources <current-payload> <historical-payload> <output>');
  const result = restoreHotspotSources(JSON.parse(readFileSync(currentFile)), JSON.parse(readFileSync(historyFile)));
  if (!result.restored.length) throw new Error('nothing_to_restore');
  result.payload.version += 1;
  result.payload.publishedAt = new Date().toISOString();
  writeFileSync(output, JSON.stringify(result.payload, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  console.log(JSON.stringify({ version: result.payload.version, restored: result.restored }));
}
