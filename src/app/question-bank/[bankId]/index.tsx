import { useLocalSearchParams } from 'expo-router';
import { CenteredState } from '@/components/states/CenteredState';
import { GlobalLoadingScreen } from '@/components/states/GlobalLoadingScreen';
import { Screen } from '@/components/ui';
import { QuestionBankCatalog } from '@/features/question-bank/components/QuestionBankCatalog';
import { useQuestionBank } from '@/features/question-bank/hooks/useQuestionBank';
import type { QuestionBankId } from '@/features/question-bank/types';

export default function QuestionBankCatalogRoute() {
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
  return <QuestionBankCatalog dataset={state.data} />;
}
