#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const opiBase = path.resolve(scriptDir, '../content/question-banks/banks/opi');
const outputPath = path.resolve(scriptDir, '../content/question-banks/opi-hotspots.json');
const runtimePath = path.resolve(scriptDir, '../src/features/content/hotspot/data/opi-hotspots.json');
const excludedCategories = new Set(['opi-category-08']);
const centerPools = [
  ['广汉考点', '绵阳考点'],
  ['广汉考点'],
  ['绵阳考点'],
  ['广汉考点', '绵阳考点', '成都考点'],
  ['广汉考点', '成都考点'],
];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function createRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function sample(items, count, next) {
  const pool = [...items];
  for (let index = pool.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(next() * (index + 1));
    [pool[index], pool[swapIndex]] = [pool[swapIndex], pool[index]];
  }
  return pool.slice(0, Math.min(count, pool.length));
}

function localDateParts(date) {
  return {
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
  };
}

function loadEligibleTopics() {
  const categoriesDir = path.join(opiBase, 'categories');
  const topicsDir = path.join(opiBase, 'topics');
  const topicIds = new Set(
    fs.readdirSync(categoriesDir)
      .filter((name) => name.endsWith('.json'))
      .map((name) => readJson(path.join(categoriesDir, name)))
      .filter((category) => !excludedCategories.has(category.id))
      .flatMap((category) => category.topicIds),
  );

  return fs.readdirSync(topicsDir)
    .filter((name) => name.endsWith('.json'))
    .map((name) => readJson(path.join(topicsDir, name)))
    .filter((topic) => topicIds.has(topic.id))
    .map((topic) => ({
      ...topic,
      cards: topic.cards.filter((card) => card.kind !== 'image' && !card.id.startsWith('opi-image-')),
    }))
    .filter((topic) => topic.cards.length >= 3);
}

const next = createRandom(20260723);
const topics = loadEligibleTopics();
const usedTopicIds = new Set();
const briefs = [];
const startDate = new Date(2026, 6, 23);

for (let offset = 0; offset < 8; offset += 1) {
  const date = new Date(startDate);
  date.setDate(date.getDate() - offset);
  const { year, month, day } = localDateParts(date);
  const dateText = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  let available = topics.filter((topic) => !usedTopicIds.has(topic.id));
  if (available.length < 5) available = topics;
  const selectedTopics = sample(available, 5, next);

  briefs.push({
    id: `hotspot-${dateText}`,
    date: dateText,
    title: `${month}月${day}日 考试资讯`,
    centers: centerPools[Math.floor(next() * centerPools.length)],
    topics: selectedTopics.map((topic) => {
      usedTopicIds.add(topic.id);
      return {
        topicId: topic.id,
        topicTitle: topic.name,
        cardIds: sample(topic.cards, 6, next).map((card) => card.id),
      };
    }),
  });
}

const outputBytes = `${JSON.stringify({
  generatedAt: '2026-07-23T14:43:19.270Z',
  briefs,
}, null, 2)}\n`;
fs.writeFileSync(outputPath, outputBytes);
fs.mkdirSync(path.dirname(runtimePath), { recursive: true });
fs.writeFileSync(runtimePath, outputBytes);

console.log(`Generated ${briefs.length} OPI hotspot briefs at ${outputPath}`);
