import { useGuideAvailability } from '@/features/usage-guide/GuideBindings';
import { useAppRouter as useRouter } from '@/components/navigation/useAppRouter';
import { createCardDirectory, directoryHasCompleteBank } from '@/features/question-bank/data/card-directory';
import { contentReleaseOf } from '@/features/question-bank/data/content-version.native';
import { useLocalSearchParams } from 'expo-router';
import type { ReactNode } from 'react';
import { normalizeStudyScope } from '@icao/contracts';
import { useProfile } from '@/features/account/profile-store.native';
import { TopBar } from '@/components/navigation/TopBar';
import { CenteredState } from '@/components/states/CenteredState';
import { GlobalLoadingScreen } from '@/components/states/GlobalLoadingScreen';
import { Screen } from '@/components/ui';
import { BookX, Shield } from '@/components/ui/icons';
import { QuestionBankStudyScreen } from '@/features/question-bank/components/QuestionBankStudyScreen';
import { useQuestionBank } from '@/features/question-bank/hooks/useQuestionBank.native';
import { useQuestionBankTopic } from '@/features/question-bank/hooks/useQuestionBankTopic.native';
import type { QuestionBankId } from '@/features/question-bank/types';

export default function NativeQuestionBankStudyRoute() {
  const router = useRouter();
  const scope = normalizeStudyScope(useProfile().studyScope);
  const { bankId, categoryId, topicId, cardId, returnTo } = useLocalSearchParams<{
    bankId: QuestionBankId;
    categoryId: string;
    topicId: string;
    cardId?: string;
    returnTo?: 'annotations' | 'radio';
  }>();
  const bankState = useQuestionBank(bankId);
  const rawCatalog = bankState.status === 'ready' ? (bankState.catalog ?? bankState.data) : undefined;
  const location = rawCatalog && cardId ? createCardDirectory([rawCatalog]).get({ bankId, cardId }) : undefined;
  const effectiveCategoryId = location?.categoryId ?? categoryId;
  const effectiveTopicId = location?.topicId ?? topicId;
  const topicState = useQuestionBankTopic(bankId, effectiveCategoryId, effectiveTopicId, contentReleaseOf(rawCatalog), bankState.status !== 'loading');
  useGuideAvailability('study', topicState.status === 'membership-required' ? '这部分题目需要会员，可查看会员方案或返回选择免费内容。'
    : bankState.status === 'error' || topicState.status === 'error' ? '题目暂时无法加载，请在页面重试或返回选择其他内容。'
      : topicState.status === 'ready' && !topicState.topic.cards.length ? '当前没有可学习的题目，请返回选择其他内容或跳过教学。' : undefined);
  const returnFromRadio = returnTo === 'radio';
  const returnLabel = returnFromRadio ? '返回随身听'
    : returnTo === 'annotations' ? '返回我的标注'
      : router.canGoBack() ? '返回上一页'
        : bankState.status === 'ready' ? '返回题库' : '返回首页';
  const returnToSource = () => {
    if (router.canGoBack()) router.back();
    else if (returnFromRadio) router.replace('/content/radio');
    else if (returnTo === 'annotations') router.replace('/annotations');
    else if (bankState.status === 'ready') router.replace({ pathname: '/question-bank/[bankId]', params: { bankId: bankState.data.id } });
    else router.replace('/(tabs)');
  };
  const stateScreen = (children: ReactNode) => (
    <Screen header={<TopBar title="题库学习" onBack={returnToSource} />}>
      {children}
    </Screen>
  );

  if (bankState.status === 'loading' || topicState.status === 'loading') return stateScreen(<GlobalLoadingScreen />);
  const category = bankState.status === 'ready'
    ? bankState.data.categories.find((item) => item.id === effectiveCategoryId)
    : undefined;
  const catalogTopic = category?.topics.find((item) => item.id === effectiveTopicId);
  const removedCard = bankState.status === 'ready' && bankState.source === 'remote' && rawCatalog
    && directoryHasCompleteBank(rawCatalog) && cardId && !location;
  if (removedCard) {
    return stateScreen(<CenteredState actionLabel={returnLabel} description="原题内容已更新或不可用，请返回后选择其他内容。" icon={BookX}
      onAction={returnToSource} title="原题不可用" />);
  }
  // Directory IDs are public even for protected questions. Scope exclusion is
  // therefore knowable before a member-only topic request returns its text.
  const outsideCatalogScope = cardId && catalogTopic?.scopeCardIds
    && !catalogTopic.scopeCardIds[scope].includes(cardId);
  const rawTopicExists = rawCatalog?.categories.some(category => category.topics.some(topic => topic.id === effectiveTopicId));
  const outsideSelection = bankState.status === 'ready' && topicState.status !== 'error' && (rawTopicExists && !catalogTopic || outsideCatalogScope
    || (topicState.status === 'ready' && ((cardId && topicState.scopeExcludedCardIds?.includes(cardId))
      || topicState.topic.declaredCardCount === 0)));
  if (outsideSelection) {
    return stateScreen(<CenteredState actionLabel="返回题库首页" description="这部分内容不在当前考试目标或题库范围内。可回到首页调整题库范围，或在个人资料中查看考试目标。" icon={BookX}
      onAction={() => router.dismissTo('/(tabs)')} title="不在当前学习范围" />);
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
  const lockedTarget = targetCardMissing && bankState.status === 'ready' && bankState.source === 'remote' && bankState.data.access?.membershipActive === false;

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
        actionLabel={returnFromRadio ? returnLabel : '重新加载'}
        description={targetCardMissing ? '原题暂时未能加载。请联网后重新加载；你的标注和学习记录仍保留。' : '学习内容暂时无法读取。请联网后重新加载；你的学习记录仍保留。'}
        icon={BookX}
        onAction={returnFromRadio ? returnToSource : () => { bankState.retry(); topicState.retry(); }}
        title="学习内容加载失败"
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
