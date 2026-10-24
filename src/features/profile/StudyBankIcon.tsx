import Svg, { Path } from 'react-native-svg';
import { BookAudio, Headphones, MessagesSquare, RadioTower } from '@/components/ui/icons';
import type { QuestionBankId } from '@/features/question-bank/types';
import { colors } from '@/theme';

export function StudyBankIcon({ bankId, size = 23 }: { bankId: QuestionBankId; size?: number }) {
  // Approved Oxanium Light wide, rounded 9, outlined once so every platform renders the same glyph offline.
  if (bankId === 'sentences900') return <Svg width={size} height={size} viewBox="0 0 24 24" aria-hidden={true}>
    <Path fill={colors.primary} transform="translate(2.78 23) scale(0.031884 -0.031884)" d="M67 434L67 541Q67 690 216 690L362 690Q511 690 511 541L511 179Q511 0 332 0L136 0L97 30L97 61L336 61Q444 61 444 169L444 286L216 286Q67 286 67 434ZM134 426Q134 346 213 346L444 346L444 551Q444 629 365 629L213 629Q134 629 134 551Z" />
  </Svg>;
  const Icon = { listening: Headphones, radiotelephony: RadioTower, opi: MessagesSquare, storytelling: BookAudio }[bankId];
  return <Icon size={size} strokeWidth={1.7} color={colors.primary} />;
}
