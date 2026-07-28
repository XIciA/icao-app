/**
 * Types for the OPI Hotspot feature.
 *
 * A hotspot briefing represents one day's exam intelligence:
 * a curated set of OPI topics with a subset of cards drawn
 * from the main OPI question bank.
 */

/** A single topic within a hotspot briefing. */
export type OpiHotspotTopic = {
  /** Reference to an OPI native topic ID, e.g. 'opi-topic-0001'. */
  topicId: string;
  /** Display name for this topic, e.g. '雷击'. */
  topicTitle: string;
  /** Card IDs drawn from this topic, e.g. ['opi-core-001', 'opi-core-002']. */
  cardIds: string[];
};

/** One day's exam intelligence briefing – one briefing = one exam set. */
export type OpiHotspotBrief = {
  /** Unique ID, e.g. 'hotspot-2026-07-09'. */
  id: string;
  /** ISO date string, e.g. '2026-07-09'. */
  date: string;
  /** Display title, e.g. '7月9日 考试资讯'. */
  title: string;
  /** Exam center location tags, e.g. ['广汉考点', '绵阳考点']. */
  centers: string[];
  /** Topics included in this briefing with their drawn card IDs. */
  topics: OpiHotspotTopic[];
};

/** The root shape of opi-hotspots.json. */
export type OpiHotspotIndex = {
  generatedAt: string;
  briefs: OpiHotspotBrief[];
};
