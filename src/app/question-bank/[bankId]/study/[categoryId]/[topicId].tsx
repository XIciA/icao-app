import { useEffect, useRef } from 'react';
import { directoryTopicWasReorganized } from '@/features/question-bank/data/directory-storage-identity';
import { createCardDirectory } from '@/features/question-bank/data/card-directory';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { CenteredState } from '@/components/states/CenteredState';
import { GlobalLoadingScreen } from '@/components/states/GlobalLoadingScreen';
import { Screen } from '@/components/ui';
import { QuestionBankStudyScreen } from '@/features/question-bank/components/QuestionBankStudyScreen';
import { useQuestionBank } from '@/features/question-bank/hooks/useQuestionBank';
import type { QuestionBankId } from '@/features/question-bank/types';

export default function QuestionBankStudyRoute() {
  const router = useRouter();
  const { bankId, categoryId, topicId, cardId, returnTo } = useLocalSearchParams<{
    bankId: QuestionBankId;
    categoryId: string;
    topicId: string;
    cardId?: string;
    returnTo?: 'annotations' | 'radio';
  }>();
  const state = useQuestionBank(bankId);

  const reorganizedTopicOnly = Boolean(!cardId && state.status === 'ready' && directoryTopicWasReorganized(bankId, topicId)
    && !state.data.categories.some(category => category.topics.some(topic => topic.id === topicId)));
  const redirectedTopic = useRef('');
  useEffect(() => {
    const key = `${bankId}/${topicId}`;
    if (!reorganizedTopicOnly || redirectedTopic.current === key) return;
    redirectedTopic.current = key;
    router.replace({ pathname: '/question-bank/[bankId]', params: { bankId } });
  }, [bankId, topicId, reorganizedTopicOnly, router]);

  if (reorganizedTopicOnly || state.status === 'loading') return <GlobalLoadingScreen />;
  const location = state.status === 'ready' && cardId ? createCardDirectory([state.data]).get({ bankId, cardId }) : undefined;
  const category = state.status === 'ready' ? state.data.categories.find((item) => item.id === (location?.categoryId ?? categoryId)) : undefined;
  const topic = category?.topics.find((item) => item.id === (location?.topicId ?? topicId));

  const targetCardMissing = Boolean(cardId && topic && !topic.cards.some((card) => card.id === cardId));
  const returnFromRadio = returnTo === 'radio';
  const returnToSource = () => returnFromRadio ? router.replace('/content/radio') : router.back();

  if (state.status === 'error' || !category || !topic || targetCardMissing) {
    return (
      <Screen>
        <CenteredState
          actionLabel={targetCardMissing || returnFromRadio ? returnFromRadio ? '返回随身听' : '返回上一页' : '重新加载'}
          onAction={targetCardMissing || returnFromRadio ? returnToSource : state.retry}
          kind={targetCardMissing ? "unavailable" : "failure"}
        />
      </Screen>
    );
  }

  if (topic.cards.length === 0) {
    return (
      <Screen>
        <CenteredState
          actionLabel={returnFromRadio ? '返回随身听' : '返回题库'}
          onAction={returnToSource}
          kind="empty"
        />
      </Screen>
    );
  }

  return <QuestionBankStudyScreen category={category} dataset={state.data} initialCardId={cardId} returnTo={returnTo} topic={topic} />;
}
