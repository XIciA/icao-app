import { useLocalSearchParams, useRouter } from 'expo-router';
import type { ReactNode } from 'react';

import { TopBar } from '@/components/navigation/TopBar';
import { CenteredState } from '@/components/states/CenteredState';
import { GlobalLoadingScreen } from '@/components/states/GlobalLoadingScreen';
import { Screen } from '@/components/ui';
import { BookX, Shield } from '@/components/ui/icons';
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
  const returnLabel = returnFromRadio ? '返回随身听'
    : returnTo === 'annotations' ? '返回我的标注'
      : router.canGoBack() ? '返回上一页'
        : bankState.status === 'ready' ? '返回题库' : '返回首页';
  const returnToSource = () => {
    if (returnFromRadio) router.replace('/content/radio');
    else if (returnTo === 'annotations') router.replace('/annotations');
    else if (router.canGoBack()) router.back();
    else if (bankState.status === 'ready') router.replace({ pathname: '/question-bank/[bankId]', params: { bankId: bankState.data.id } });
    else router.replace('/(tabs)');
  };
  const stateScreen = (children: ReactNode) => (
    <Screen>
      <TopBar title="题库学习" onBack={returnToSource} />
      {children}
    </Screen>
  );

  if (bankState.status === 'loading' || topicState.status === 'loading') return stateScreen(<GlobalLoadingScreen />);
  const category = bankState.status === 'ready'
    ? bankState.data.categories.find((item) => item.id === categoryId)
    : undefined;
  const catalogTopic = category?.topics.find((item) => item.id === topicId);
  const removedCard = cardId && catalogTopic?.scopeCardIds && !catalogTopic.scopeCardIds.all.includes(cardId);
  if (removedCard) {
    return stateScreen(<CenteredState actionLabel={returnLabel} description="原题内容已更新或不可用，请返回后选择其他内容。" icon={BookX}
      onAction={returnToSource} title="原题不可用" />);
  }
  const outsideSelection = bankState.status === 'ready' && topicState.status !== 'error' && (!category
    || (topicState.status === 'ready' && ((cardId && topicState.scopeExcludedCardIds?.includes(cardId))
      || topicState.topic.declaredCardCount === 0)));
  if (outsideSelection) {
    return stateScreen(<CenteredState actionLabel="返回题库首页" description="这部分内容不在当前考试目标或题库范围内。可回到首页调整题库范围，或在个人资料中查看考试目标。" icon={BookX}
      onAction={() => router.replace('/(tabs)')} title="不在当前学习范围" />);
  }
  if (topicState.status === 'membership-required') {
    return stateScreen(
      <CenteredState
        actionLabel="查看会员方案"
        description="这部分内容属于会员权益。开通后即可在线学习，并可按需保存到本机离线使用。"
        icon={Shield}
        onAction={() => router.push('/account/membership')}
        title="会员内容"
      />
    );
  }
  const topic = topicState.status === 'ready' ? topicState.topic : undefined;
  const targetCardMissing = Boolean(cardId && topic && !topic.cards.some((card) => card.id === cardId));
  const lockedTarget = targetCardMissing && bankState.status === 'ready' && bankState.data.access?.membershipActive !== true;

  if (lockedTarget) {
    return stateScreen(
      <CenteredState
        actionLabel="查看会员方案"
        description="这道题属于会员权益，开通会员后即可继续学习。"
        icon={Shield}
        onAction={() => router.push('/account/membership')}
        title="会员内容"
      />
    );
  }
  if (bankState.status === 'error' || topicState.status === 'error' || !category || !topic || targetCardMissing) {
    return stateScreen(
      <CenteredState
        actionLabel={targetCardMissing || returnFromRadio ? returnLabel : '重新加载'}
        description={targetCardMissing ? '原题内容已更新或不可用，请返回后选择其他内容。' : '当前学习主题不存在或读取失败，请返回后重试。'}
        icon={BookX}
        onAction={targetCardMissing || returnFromRadio ? returnToSource : () => { bankState.retry(); topicState.retry(); }}
        title={targetCardMissing ? '原题不可用' : '学习内容加载失败'}
        tone="destructive"
      />
    );
  }
  if (topic.cards.length === 0) {
    return stateScreen(
      <CenteredState
        actionLabel={returnLabel}
        description="题目正在整理中，可以先返回选择其他内容继续学习。"
        icon={BookX}
        onAction={returnToSource}
        title="这个主题还没有内容"
      />
    );
  }
  return <QuestionBankStudyScreen category={category} dataset={bankState.data} initialCardId={cardId} returnTo={returnTo} topic={topic} />;
}
