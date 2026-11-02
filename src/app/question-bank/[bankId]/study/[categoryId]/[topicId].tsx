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

  if (state.status === 'loading') return <GlobalLoadingScreen />;
  const category = state.status === 'ready' ? state.data.categories.find((item) => item.id === categoryId) : undefined;
  const topic = category?.topics.find((item) => item.id === topicId);

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
