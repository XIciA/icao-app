import { useLocalSearchParams, useRouter } from 'expo-router';
import { BookX } from 'lucide-react-native';

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
          description={targetCardMissing ? returnFromRadio ? '这条随身听内容已更新或不可用，请返回随身听选择其他曲目。' : '原题内容已更新或不可用，请返回“我的标注”选择其他内容。' : '当前学习主题不存在或读取失败，请返回后重试。'}
          icon={BookX}
          onAction={targetCardMissing || returnFromRadio ? returnToSource : state.retry}
          title={targetCardMissing ? '原题不可用' : '学习内容加载失败'}
          tone="destructive"
        />
      </Screen>
    );
  }

  if (topic.cards.length === 0) {
    return (
      <Screen>
        <CenteredState
          actionLabel={returnFromRadio ? '返回随身听' : '返回题库'}
          description="题目正在整理中，可以先返回题库选择其他主题继续学习。"
          icon={BookX}
          onAction={returnToSource}
          title="这个主题还没有内容"
        />
      </Screen>
    );
  }

  return <QuestionBankStudyScreen category={category} dataset={state.data} initialCardId={cardId} returnTo={returnTo} topic={topic} />;
}
