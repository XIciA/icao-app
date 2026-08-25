import { useLocalSearchParams, useRouter } from 'expo-router';
import { BookX, Shield } from '@/components/ui/icons';

import { CenteredState } from '@/components/states/CenteredState';
import { GlobalLoadingScreen } from '@/components/states/GlobalLoadingScreen';
import { Screen } from '@/components/ui';
import { QuestionBankStudyScreen } from '@/features/question-bank/components/QuestionBankStudyScreen';
import { useQuestionBank } from '@/features/question-bank/hooks/useQuestionBank';
import { useQuestionBankTopic } from '@/features/question-bank/hooks/useQuestionBankTopic.native';
import type { QuestionBankId } from '@/features/question-bank/types';

export default function NativeQuestionBankStudyRoute() {
  const router = useRouter();
  const { bankId, categoryId, topicId, cardId, returnTo } = useLocalSearchParams<{
    bankId: QuestionBankId;
    categoryId: string;
    topicId: string;
    cardId?: string;
    returnTo?: 'annotations' | 'radio';
  }>();
  const bankState = useQuestionBank(bankId);
  const topicState = useQuestionBankTopic(bankId, categoryId, topicId);
  const returnFromRadio = returnTo === 'radio';
  const returnToSource = () => returnFromRadio ? router.replace('/content/radio') : router.back();

  if (bankState.status === 'loading' || topicState.status === 'loading') return <GlobalLoadingScreen />;
  if (topicState.status === 'membership-required') {
    return (
      <Screen>
        <CenteredState
          actionLabel="查看会员方案"
          description="这部分内容属于会员权益。开通后即可在线学习，并可按需保存到本机离线使用。"
          icon={Shield}
          onAction={() => router.push('/account/membership')}
          title="会员内容"
        />
      </Screen>
    );
  }
  const category = bankState.status === 'ready'
    ? bankState.data.categories.find((item) => item.id === categoryId)
    : undefined;
  const topic = topicState.status === 'ready' ? topicState.topic : undefined;
  const targetCardMissing = Boolean(cardId && topic && !topic.cards.some((card) => card.id === cardId));
  const lockedTarget = targetCardMissing && bankState.status === 'ready' && bankState.data.access?.membershipActive !== true;

  if (lockedTarget) {
    return (
      <Screen>
        <CenteredState
          actionLabel="查看会员方案"
          description="这道题属于会员权益，开通会员后即可继续学习。"
          icon={Shield}
          onAction={() => router.push('/account/membership')}
          title="会员内容"
        />
      </Screen>
    );
  }
  if (bankState.status === 'error' || topicState.status === 'error' || !category || !topic || targetCardMissing) {
    return (
      <Screen>
        <CenteredState
          actionLabel={targetCardMissing || returnFromRadio ? returnFromRadio ? '返回随身听' : '返回上一页' : '重新加载'}
          description={targetCardMissing ? '原题内容已更新或不可用，请返回后选择其他内容。' : '当前学习主题不存在或读取失败，请返回后重试。'}
          icon={BookX}
          onAction={targetCardMissing || returnFromRadio ? returnToSource : () => { bankState.retry(); topicState.retry(); }}
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
  return <QuestionBankStudyScreen category={category} dataset={bankState.data} initialCardId={cardId} returnTo={returnTo} topic={topic} />;
}
