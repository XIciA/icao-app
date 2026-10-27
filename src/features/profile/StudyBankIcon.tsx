import { forwardRef, type ComponentProps } from 'react';
import Svg, { Path } from 'react-native-svg';
import { BookAudio, Headphones, MessagesSquare, RadioTower, type LucideIcon } from '@/components/ui/icons';
import type { QuestionBankDataset, QuestionBankId } from '@/features/question-bank/types';
import { colors } from '@/theme';

/** The approved outlined numeral, shared by every 900-sentence entry. */
const SentenceNine = forwardRef<SVGSVGElement, ComponentProps<LucideIcon>>(function SentenceNine({ size = 23, color = colors.primary, ...props }, _ref) {
  return <Svg {...props} width={size} height={size} viewBox="0 0 24 24" aria-hidden={true}>
    <Path fill={color} transform="translate(2.78 23) scale(0.031884 -0.031884)" d="M67 434L67 541Q67 690 216 690L362 690Q511 690 511 541L511 179Q511 0 332 0L136 0L97 30L97 61L336 61Q444 61 444 169L444 286L216 286Q67 286 67 434ZM134 426Q134 346 213 346L444 346L444 551Q444 629 365 629L213 629Q134 629 134 551Z" />
  </Svg>;
});
function outlined(Icon: LucideIcon): LucideIcon {
  return forwardRef<SVGSVGElement, ComponentProps<LucideIcon>>(function StudyIcon(props, _ref) {
    return <Icon strokeWidth={1.7} {...props} />;
  });
}
export const studyBankIcons = { listening: outlined(Headphones), sentences900: SentenceNine, radiotelephony: outlined(RadioTower), opi: outlined(MessagesSquare), storytelling: outlined(BookAudio) };
export const studyDatasetIcons: Record<QuestionBankDataset['icon'], LucideIcon> = {
  headphones: studyBankIcons.listening, sentences: studyBankIcons.sentences900, radioTower: studyBankIcons.radiotelephony, mic: studyBankIcons.opi, story: studyBankIcons.storytelling,
};
export function StudyBankIcon({ bankId, size = 23 }: { bankId: QuestionBankId; size?: number }) {
  const Icon = studyBankIcons[bankId];
  return <Icon size={size} strokeWidth={1.7} color={colors.primary} />;
}
