#!/usr/bin/env node
/**
 * Generate opi-hotspots.json with randomised exam briefings.
 *
 * Usage:  node --import tsx scripts/generate-opi-hotspots.ts
 *   or:   npx tsx scripts/generate-opi-hotspots.ts
 *
 * Reads the OPI question bank from content/question-banks/banks/opi/,
 * excludes category-08 (image questions), and randomly samples topics
 * and cards to build briefings that resemble daily exam intelligence.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const OPI_BASE = path.resolve(__dirname, '../content/question-banks/banks/opi');
const OUTPUT = path.resolve(__dirname, '../content/question-banks/opi-hotspots.json');

/** Category IDs to exclude (image questions). */
const EXCLUDED_CATEGORIES = new Set(['opi-category-08']);

/** Number of briefings to generate. */
const BRIEFING_COUNT = 8;

/** Topics per briefing (approximate). */
const TOPICS_PER_BRIEFING = 5;

/** Cards sampled per topic. */
const CARDS_PER_TOPIC = 6;

/** Start date for generated briefings (most recent first). */
const START_DATE = new Date('2026-07-23');

/** Exam center pools. */
const CENTER_POOLS = [
  ['广汉考点', '绵阳考点'],
  ['广汉考点'],
  ['绵阳考点'],
  ['广汉考点', '绵阳考点', '成都考点'],
  ['广汉考点', '成都考点'],
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T;
}

/** Deterministic PRNG (same as mock-exam build-session). */
function createRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(items: T[], next: () => number): T[] {
  const pool = [...items];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool;
}

function sample<T>(items: readonly T[], count: number, next: () => number): T[] {
  const shuffled = shuffle([...items], next);
  return shuffled.slice(0, Math.min(count, shuffled.length));
}

function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatTitle(date: Date): string {
  return `${date.getMonth() + 1}月${date.getDate()}日 考试资讯`;
}

// ---------------------------------------------------------------------------
// Data loading
// ---------------------------------------------------------------------------

type CategoryFile = { id: string; name: string; topicIds: string[]; declaredCardCount: number };
type TopicFile = { categoryId: string; id: string; name: string; declaredCardCount: number; cards: { id: string; kind?: string }[] };

function loadOpiData() {
  const categoriesDir = path.join(OPI_BASE, 'categories');
  const topicsDir = path.join(OPI_BASE, 'topics');

  const categoryFiles = fs.readdirSync(categoriesDir).filter((f) => f.endsWith('.json'));
  const categories: CategoryFile[] = categoryFiles
    .map((f) => readJson<CategoryFile>(path.join(categoriesDir, f)))
    .filter((c) => !EXCLUDED_CATEGORIES.has(c.id));

  const topicIds = new Set(categories.flatMap((c) => c.topicIds));
  const topicFiles = fs.readdirSync(topicsDir).filter((f) => f.endsWith('.json'));
  const topics: TopicFile[] = topicFiles
    .map((f) => readJson<TopicFile>(path.join(topicsDir, f)))
    .filter((t) => topicIds.has(t.id));

  // Filter out image cards from every topic
  for (const topic of topics) {
    topic.cards = topic.cards.filter((c) => c.kind !== 'image' && !c.id.startsWith('opi-image-'));
  }

  // Only keep topics with enough text cards
  const eligibleTopics = topics.filter((t) => t.cards.length >= 3);
  return { categories, topics: eligibleTopics };
}

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

function generate() {
  const { topics } = loadOpiData();
  console.log(`Loaded ${topics.length} eligible topics (image-free, ≥3 cards).`);

  const seed = 20260723;
  const next = createRandom(seed);
  const briefs: Array<{
    id: string;
    date: string;
    title: string;
    centers: string[];
    topics: Array<{ topicId: string; topicTitle: string; cardIds: string[] }>;
  }> = [];

  // Track used topics to maximise variety across briefings
  const usedTopicIds = new Set<string>();

  for (let i = 0; i < BRIEFING_COUNT; i++) {
    const date = new Date(START_DATE);
    date.setDate(date.getDate() - i);
    const dateStr = formatDate(date);

    // Prefer unused topics, fallback to any
    let available = topics.filter((t) => !usedTopicIds.has(t.id));
    if (available.length < TOPICS_PER_BRIEFING) {
      available = [...topics];
    }

    const selectedTopics = sample(available, TOPICS_PER_BRIEFING, next);
    const centers = CENTER_POOLS[Math.floor(next() * CENTER_POOLS.length)];

    const briefTopics = selectedTopics.map((topic) => {
      usedTopicIds.add(topic.id);
      const cardsToSample = Math.min(CARDS_PER_TOPIC, topic.cards.length);
      const sampledCards = sample(topic.cards, cardsToSample, next);
      return {
        topicId: topic.id,
        topicTitle: topic.name,
        cardIds: sampledCards.map((c) => c.id),
      };
    });

    briefs.push({
      id: `hotspot-${dateStr}`,
      date: dateStr,
      title: formatTitle(date),
      centers,
      topics: briefTopics,
    });
  }

  const output = {
    generatedAt: new Date().toISOString(),
    briefs,
  };

  fs.writeFileSync(OUTPUT, JSON.stringify(output, null, 2) + '\n', 'utf-8');

  // Summary
  const totalCards = briefs.reduce((sum, b) => sum + b.topics.reduce((s, t) => s + t.cardIds.length, 0), 0);
  console.log(`Generated ${briefs.length} briefings with ${totalCards} total card references.`);
  console.log(`Output: ${OUTPUT}`);
}

generate();
