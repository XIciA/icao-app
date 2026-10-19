import { BadRequestException, ConflictException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { canonicalAppContentJson, normalizeDailyHotspots, hotspotSources, type AppContentSnapshot, type AppContentHotspotBrief } from '@icao/contracts/app-content';
import type { ContentDraft } from '@icao/contracts/content-workflow';
import { cardsOf, type Bank } from './content-workflow-validation';

const hash = (value: unknown) => createHash('sha256').update(canonicalAppContentJson(value)).digest('hex');

export function replaceHistoricalHotspots(app: AppContentSnapshot, update: NonNullable<ContentDraft['hotspotUpdates']>): AppContentHotspotBrief[] {
  if (hash(app) !== update.baseChecksum) throw new ConflictException('hotspot_base_changed_reprocess_order');
  const originals=app.hotspots.briefs.flatMap(brief=>hotspotSources(brief).map(source=>({id:source.id,date:brief.date,title:source.title,centers:source.centers,topics:source.topics})));
  const replacements = new Map(update.briefs.map(brief => [brief.id, brief]));
  if (replacements.size !== update.briefs.length) throw new BadRequestException('duplicate_historical_hotspot');
  for (const brief of update.briefs) {
    const previous = originals.find(item => item.id === brief.id);
    if (!previous || previous.date !== brief.date || hash(previous.centers) !== hash(brief.centers)) {
      throw new BadRequestException('historical_hotspot_identity_must_be_preserved');
    }
  }
  const updated=originals.map(brief => replacements.get(brief.id) ?? brief);
  if(!app.hotspots.briefs.some(b=>b.sources))return updated;
  const sources=new Map(app.hotspots.briefs.flatMap(hotspotSources).map(s=>[s.id,s]));
  return normalizeDailyHotspots(updated.map(brief=>({...brief,sources:[{...sources.get(brief.id)!,centers:brief.centers,topics:brief.topics}]})));
}

export function validateHotspotReferences(briefs: AppContentHotspotBrief[], bank: Bank) {
  const cards = new Map(cardsOf(bank).map(entry => [entry.card.id, entry]));
  for (const brief of briefs.flatMap(brief=>[brief,...hotspotSources(brief)])) {
    const ids = new Set<string>();
    for (const group of brief.topics) for (const id of group.cardIds) {
      const entry = cards.get(id);
      if (ids.has(id) || !entry || entry.card.retired || entry.topic.id !== group.topicId || entry.topic.name !== group.topicTitle) {
        throw new BadRequestException('hotspot_reference_invalid');
      }
      ids.add(id);
    }
  }
}

export function validateExclusions(draft: ContentDraft, previousBanks: { bankId: string; payload: unknown }[]) {
  const references = new Set([...(draft.hotspot ? [draft.hotspot] : []), ...(draft.hotspotUpdates?.briefs ?? [])].flatMap(b => b.topics.flatMap(t => t.cardIds)));
  for (const decision of draft.decisions.filter(d => d.kind === 'excluded')) {
    if (!decision.reason?.trim()) throw new BadRequestException('exclusion_reason_required');
    if (!decision.cardId) continue;
    if (references.has(decision.cardId)) throw new BadRequestException('excluded_question_still_referenced');
    for (const change of draft.banks) {
      const card = cardsOf(change.payload as Bank).find(e => e.card.id === decision.cardId)?.card;
      if (!card || card.retired) continue;
      const previous = previousBanks.find(b => b.bankId === change.bankId);
      const old = previous && cardsOf(previous.payload as Bank).find(e => e.card.id === decision.cardId)?.card;
      // Ambiguous feedback may leave an unchanged, reliable old question intact.
      if (hash(card) !== hash(old ?? null)) throw new BadRequestException('excluded_question_has_active_changes');
    }
  }
}
