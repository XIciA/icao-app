import type { ContentAccessScope } from '@icao/contracts';

import {
  inspectOfflineMemberTopicAccess,
} from '@/features/question-bank/data/member-content-cache';
import {
  loadQuestionBank,
  questionBankRepository,
} from '@/features/question-bank/data/repository';
import { getConnectivity } from '@/features/question-bank/platform/network-service';
import type {
  QuestionBankDataset,
  QuestionBankTopic,
} from '@/features/question-bank/types';

import { buildHotspotSession, resolveHotspotTopics } from './build-hotspot-session';
import {
  classifyHotspotFailure,
  isHotspotNetworkFailure,
  safeHotspotRequestId,
  type HotspotAccessResult,
} from './access-state';
import { getHotspotBrief } from './repository';
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
    const loaded = await questionBankRepository.getTopic('opi', scope.categoryId, scope.topicId);
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

export async function loadHotspotAccess(briefId: string): Promise<HotspotAccessResult> {
  const brief = getHotspotBrief(briefId);
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
      session: buildHotspotSession(brief, dataset),
    };
  } catch (error) {
    if (targets && isHotspotNetworkFailure(error) && await hasExpiredOfflineAuthorization(targets)) {
      return {
        status: 'offline-authorization-expired',
        brief,
        requestId: safeHotspotRequestId(error),
      };
    }
    return classifyHotspotFailure(brief, error);
  }
}
