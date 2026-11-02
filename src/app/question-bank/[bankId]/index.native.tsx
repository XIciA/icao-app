import { GuestLearningBoundary } from '@/features/auth/GuestLearningBoundary.native';
import { useLocalSearchParams } from 'expo-router';
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
          actionLabel="重试"
          onAction={state.retry}
          kind="failure"
        />
      </Screen>
    );
  }
  return <QuestionBankCatalog dataset={state.data} warning={state.warning} onRetry={state.retry} />;
}
