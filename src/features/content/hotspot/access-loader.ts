import { loadQuestionBank } from '@/features/question-bank/data/repository';

import { buildHotspotSession, resolveHotspotTopics } from './build-hotspot-session';
import { classifyHotspotFailure, type HotspotAccessResult } from './access-state';
import { getHotspotBrief } from './repository';

export async function loadHotspotAccess(briefId: string): Promise<HotspotAccessResult> {
  const brief = getHotspotBrief(briefId);
  if (!brief) return { status: 'not-found' };

  try {
    const result = await loadQuestionBank('opi');
    if (!result?.dataset) return { status: 'content-unavailable', brief };
    const topics = resolveHotspotTopics(brief, result.dataset);
    return {
      status: 'ready',
      brief,
      topics,
      session: buildHotspotSession(brief, result.dataset),
    };
  } catch (error) {
    return classifyHotspotFailure(brief, error);
  }
}
