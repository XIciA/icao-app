import { useLocalSearchParams } from 'expo-router';
import { BookX } from 'lucide-react-native';

import { CenteredState } from '@/components/states/CenteredState';
import { GlobalLoadingScreen } from '@/components/states/GlobalLoadingScreen';
import { Screen } from '@/components/ui';
import { ListeningStudyScreen } from '@/features/question-bank/components/ListeningStudyScreen';
import { useQuestionBank } from '@/features/question-bank/hooks/useQuestionBank';
import type { QuestionBankId } from '@/features/question-bank/types';

export default function QuestionBankStudyRoute() {
  const { bankId, categoryId, topicId } = useLocalSearchParams<{
    bankId: QuestionBankId;
    categoryId: string;
    topicId: string;
  }>();
  const state = useQuestionBank(bankId);

  if (state.status === 'loading') return <GlobalLoadingScreen />;
  const category = state.status === 'ready' ? state.data.categories.find((item) => item.id === categoryId) : undefined;
  const topic = category?.topics.find((item) => item.id === topicId);

  if (state.status === 'error' || !category || !topic) {
    return (
      <Screen>
        <CenteredState
          actionLabel="重新加载"
          description="当前学习主题不存在或读取失败，请返回后重试。"
          icon={BookX}
          onAction={state.retry}
          title="学习内容加载失败"
          tone="destructive"
        />
      </Screen>
    );
  }

  return <ListeningStudyScreen category={category} dataset={state.data} topic={topic} />;
}
