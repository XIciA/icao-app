import { useLocalBack } from '@/components/navigation/useLocalBack';
import { GlobalLoadingScreen } from './GlobalLoadingScreen';
/** Retains local system-back ownership; uses the single shared loading surface. */
export function LocalBackLoadingScreen({ onBack }: { title?: string; onBack: () => void }) {
  useLocalBack(true, onBack);
  return <GlobalLoadingScreen />;
}
