import { GuestLearningBoundary } from '@/features/auth/GuestLearningBoundary.native';
import { useLocalSearchParams } from 'expo-router';
import { LibraryBig } from '@/components/ui/icons';

import { CenteredState } from '@/components/states/CenteredState';
import { GlobalLoadingScreen } from '@/components/states/GlobalLoadingScreen';
import { Screen } from '@/components/ui';
import { QuestionBankCatalog } from '@/features/question-bank/components/QuestionBankCatalog.native';
import { useQuestionBank } from '@/features/question-bank/hooks/useQuestionBank.native';
import type { QuestionBankId } from '@/features/question-bank/types';

export default function QuestionBankCatalogRoute() { return <GuestLearningBoundary><QuestionBankCatalogRouteBody /></GuestLearningBoundary>; }

function QuestionBankCatalogRouteBody() {
  const { bankId } = useLocalSearchParams<{ bankId: QuestionBankId }>();
  const state = useQuestionBank(bankId);

  if (state.status === 'loading') return <GlobalLoadingScreen />;
  if (state.status === 'error') {
    return (
      <Screen>
        <CenteredState
          actionLabel="重新加载"
          description="题库数据暂时无法读取，请重试。"
          icon={LibraryBig}
          onAction={state.retry}
          title="题库加载失败"
          tone="destructive"
        />
      </Screen>
    );
  }
  return <QuestionBankCatalog dataset={state.data} exportDataset={state.catalog} warning={state.warning} onRetry={state.retry} />;
}
