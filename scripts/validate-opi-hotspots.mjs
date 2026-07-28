#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const contentRoot = path.resolve(scriptDir, '../content/question-banks');
const indexPath = path.join(contentRoot, 'opi-hotspots.json');
const runtimePath = path.resolve(scriptDir, '../src/features/content/hotspot/data/opi-hotspots.json');
const topicsDir = path.join(contentRoot, 'banks/opi/topics');
if (!fs.existsSync(runtimePath)) throw new Error('opi_hotspot_validation_failed:runtime_index_missing');
if (!fs.readFileSync(indexPath).equals(fs.readFileSync(runtimePath))) {
  throw new Error('opi_hotspot_validation_failed:runtime_index_stale_run_opi_hotspot_build');
}
const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
const topics = new Map(
  fs.readdirSync(topicsDir)
    .filter((name) => name.endsWith('.json'))
    .map((name) => {
      const topic = JSON.parse(fs.readFileSync(path.join(topicsDir, name), 'utf8'));
      return [topic.id, topic];
    }),
);

function assert(condition, message) {
  if (!condition) throw new Error(`opi_hotspot_validation_failed:${message}`);
}

assert(typeof index.generatedAt === 'string' && !Number.isNaN(Date.parse(index.generatedAt)), 'invalid_generated_at');
assert(Array.isArray(index.briefs) && index.briefs.length > 0, 'empty_briefs');

const briefIds = new Set();
const briefDates = new Set();
for (const brief of index.briefs) {
  assert(typeof brief.id === 'string' && !briefIds.has(brief.id), `duplicate_brief_id:${brief.id}`);
  assert(/^\d{4}-\d{2}-\d{2}$/.test(brief.date) && !briefDates.has(brief.date), `invalid_or_duplicate_date:${brief.date}`);
  assert(brief.id === `hotspot-${brief.date}`, `brief_id_date_mismatch:${brief.id}`);
  assert(typeof brief.title === 'string' && brief.title.length > 0, `missing_title:${brief.id}`);
  assert(Array.isArray(brief.centers) && brief.centers.length > 0, `missing_centers:${brief.id}`);
  assert(Array.isArray(brief.topics) && brief.topics.length > 0, `missing_topics:${brief.id}`);
  briefIds.add(brief.id);
  briefDates.add(brief.date);

  const topicIds = new Set();
  const cardIds = new Set();
  for (const hotspotTopic of brief.topics) {
    const sourceTopic = topics.get(hotspotTopic.topicId);
    assert(sourceTopic && !topicIds.has(hotspotTopic.topicId), `missing_or_duplicate_topic:${brief.id}:${hotspotTopic.topicId}`);
    assert(sourceTopic.name === hotspotTopic.topicTitle, `topic_title_mismatch:${brief.id}:${hotspotTopic.topicId}`);
    assert(Array.isArray(hotspotTopic.cardIds) && hotspotTopic.cardIds.length > 0, `empty_topic:${brief.id}:${hotspotTopic.topicId}`);
    topicIds.add(hotspotTopic.topicId);

    const sourceCards = new Map(sourceTopic.cards.map((card) => [card.id, card]));
    for (const cardId of hotspotTopic.cardIds) {
      const card = sourceCards.get(cardId);
      assert(card, `card_not_in_topic:${brief.id}:${hotspotTopic.topicId}:${cardId}`);
      assert(card.kind !== 'image' && !card.id.startsWith('opi-image-'), `image_card:${brief.id}:${cardId}`);
      assert(!cardIds.has(cardId), `duplicate_card:${brief.id}:${cardId}`);
      cardIds.add(cardId);
    }
  }
}

const sortedDates = [...briefDates].sort((a, b) => b.localeCompare(a));
assert(index.briefs.every((brief, indexPosition) => brief.date === sortedDates[indexPosition]), 'briefs_not_descending');

console.log(`OPI hotspot data verified: ${index.briefs.length} briefs`);
