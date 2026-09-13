import {
  BookOpenText,
  Headphones,
  MessageSquareQuote,
  Mic2,
  RadioTower,
  UserRound,
} from '@/components/ui/icons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';

import { TabPlaceholderScreen } from '@/components/screens/TabPlaceholderScreen';
import { getEmbeddedQuestionBanks } from '@/features/question-bank/data/repository';
import type { QuestionBankDataset } from '@/features/question-bank/types';
import { colors, radii } from '@/theme';

const bankIcons: Record<QuestionBankDataset['icon'], typeof Headphones> = {
  headphones: Headphones,
  sentences: MessageSquareQuote,
  radioTower: RadioTower,
  mic: Mic2,
  story: BookOpenText,
};

const entries = getEmbeddedQuestionBanks().map((bank) => ({
  slug: bank.id,
  title: bank.title,
  description: bank.description,
  meta: bank.summary,
  icon: bankIcons[bank.icon],
}));

export default function QuestionBankTab() {
  const router = useRouter();

  return (
    <TabPlaceholderScreen
      entries={entries}
      headerLeading={
        <Pressable
          accessibilityLabel="打开个人资料"
          accessibilityRole="button"
          onPress={() => router.push('/account/profile')}
          style={({ pressed }) => [styles.profileButton, pressed ? styles.pressed : null]}
        >
          <UserRound color={colors.mutedForeground} size={20} />
        </Pressable>
      }
      onEntryPress={(entry) => {
        router.push({ pathname: '/question-bank/[bankId]', params: { bankId: entry.slug } });
      }}
      subtitle="五类题库集中呈现，按自己的节奏开始练习。"
      title="航空英语题库"
    />
  );
}

const styles = StyleSheet.create({
  profileButton: {
    alignItems: 'center',
    backgroundColor: colors.secondary,
    borderColor: colors.border,
    borderRadius: radii.full,
    borderTopColor: 'rgba(255,255,255,0.72)',
    borderWidth: StyleSheet.hairlineWidth,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  pressed: { opacity: 0.78, transform: [{ scale: 0.97 }] },
});
