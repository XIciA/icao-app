import { contentReleaseOf } from '@/features/question-bank/data/content-version.native';
import type { ContentAccessScope } from '@icao/contracts';

import {
  inspectOfflineMemberTopicAccess,
} from '@/features/question-bank/data/member-content-cache.native';
import {
  loadQuestionBank,
  questionBankRepository,
} from '@/features/question-bank/data/repository.native';
import { getConnectivity } from '@/features/question-bank/platform/network-service';
import type {
  QuestionBankDataset,
  QuestionBankTopic,
} from '@/features/question-bank/types';

import { resolveHotspotTopics } from './resolve-hotspot-topics.native';
import { buildHotspotStudyPackage } from './build-hotspot-study-package.native';
import {
  classifyHotspotFailure,
  isHotspotNetworkFailure,
  safeHotspotRequestId,
  type HotspotAccessResult,
} from './access-state.native';
import { loadHotspotBrief } from './repository.native';
import type { OpiHotspotBrief } from './types';

type TopicTarget = {
  scope: ContentAccessScope;
  topic: QuestionBankTopic;
};

function resolveTopicTargets(dataset: QuestionBankDataset, brief: OpiHotspotBrief) {
  const targets = new Map<string, TopicTarget>();
  for (const category of dataset.categories) {
    for (const topic of category.topics) {
      if (!brief.topics.some((candidate) => candidate.topicId === topic.id)) continue;
      targets.set(topic.id, {
        scope: { bankId: 'opi', categoryId: category.id, topicId: topic.id },
        topic,
      });
    }
  }
  return brief.topics.every((topic) => targets.has(topic.topicId)) ? targets : undefined;
}

function hasEveryRequestedCard(brief: OpiHotspotBrief, topic: QuestionBankTopic) {
  const requested = brief.topics.find((candidate) => candidate.topicId === topic.id);
  if (!requested) return false;
  const available = new Set(topic.cards.map((card) => card.id));
  return requested.cardIds.every((cardId) => available.has(cardId));
}

async function hydrateAuthorizedDataset(
  dataset: QuestionBankDataset,
  brief: OpiHotspotBrief,
  targets: Map<string, TopicTarget>,
) {
  const loadedTopics = new Map<string, QuestionBankTopic>();
  await Promise.all([...targets.values()].map(async ({ scope, topic }) => {
    if (hasEveryRequestedCard(brief, topic)) {
      loadedTopics.set(topic.id, topic);
      return;
    }
    const loaded = await questionBankRepository.getTopic('opi', scope.categoryId, scope.topicId, contentReleaseOf(dataset));
    if (!loaded) throw new Error('hotspot_topic_unavailable');
    loadedTopics.set(topic.id, loaded);
  }));

  return {
    ...dataset,
    categories: dataset.categories.map((category) => ({
      ...category,
      topics: category.topics.map((topic) => loadedTopics.get(topic.id) ?? topic),
    })),
  };
}

async function hasExpiredOfflineAuthorization(targets: Map<string, TopicTarget>) {
  const connectivity = await getConnectivity();
  if (connectivity !== 'offline') return false;
  const states = await Promise.all([...targets.values()].map(({ scope }) => (
    inspectOfflineMemberTopicAccess(scope)
  )));
  return states.includes('expired');
}

async function resolveHotspotFailure(
  brief: OpiHotspotBrief,
  targets: Map<string, TopicTarget> | undefined,
  error: unknown,
): Promise<Exclude<HotspotAccessResult, { status: 'ready' } | { status: 'not-found' }>> {
  if (targets && isHotspotNetworkFailure(error)) {
    try {
      if (await hasExpiredOfflineAuthorization(targets)) {
        return {
          status: 'offline-authorization-expired',
          brief,
          requestId: safeHotspotRequestId(error),
        };
      }
    } catch {
      // Cache and connectivity inspection are diagnostic only. Their failure
      // must not reject the user-facing loader or leave its consumer loading.
    }
  }
  return classifyHotspotFailure(brief, error);
}

export async function loadHotspotAccess(briefId: string): Promise<HotspotAccessResult> {
  let brief: OpiHotspotBrief | undefined;
  try { brief = await loadHotspotBrief(briefId); }
  catch { return { status: 'network-error' }; }
  if (!brief) return { status: 'not-found' };

  let targets: Map<string, TopicTarget> | undefined;
  try {
    const result = await loadQuestionBank('opi');
    if (!result?.dataset) return { status: 'content-unavailable', brief };
    targets = resolveTopicTargets(result.dataset, brief);
    if (!targets) return { status: 'content-unavailable', brief };

    const dataset = await hydrateAuthorizedDataset(result.dataset, brief, targets);
    const topics = resolveHotspotTopics(brief, dataset);
    return {
      status: 'ready',
      brief,
      topics,
      session: buildHotspotStudyPackage(brief, dataset),
    };
  } catch (error) {
    return resolveHotspotFailure(brief, targets, error);
  }
}
