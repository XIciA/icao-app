import { useLocalBack } from '@/components/navigation/useLocalBack';
import { TopBar } from '@/components/navigation/TopBar';
import { AppText, Screen } from '@/components/ui';

/** A nested view must retain its local back target even before its chunk loads. */
export function LocalBackLoadingScreen({ title, onBack }: { title: string; onBack: () => void }) {
  const back = useLocalBack(true, onBack);
  return <Screen><TopBar title={title} onBack={back} /><AppText>正在打开记录…</AppText></Screen>;
}
