import { BookOpenText, Headphones, MessageSquareQuote, Mic2, RadioTower } from 'lucide-react-native';
import { useRouter } from 'expo-router';

import { TabPlaceholderScreen } from '@/components/screens/TabPlaceholderScreen';

const entries = [
  {
    slug: 'listening',
    title: '听力',
    description: '真实陆空通话情境的听力理解训练。',
    meta: '4 题组 · 631 题',
    icon: Headphones,
  },
  {
    slug: 'sentences900',
    title: '900 句',
    description: '民航英语高频句型跟读与记忆。',
    meta: '3 等级 · 900 句',
    icon: MessageSquareQuote,
  },
  {
    slug: 'radiotelephony',
    title: '陆空通话',
    description: '标准通话用语与特情处置表达训练。',
    meta: '107 场景 · 1851 卡',
    icon: RadioTower,
  },
  {
    slug: 'opi',
    title: 'OPI',
    description: '围绕航空主题组织观点与口语表达。',
    meta: '121 话题 · 1269 卡',
    icon: Mic2,
  },
  {
    slug: 'storytelling',
    title: '故事复诵',
    description: '听取航空故事并完成结构化复述训练。',
    meta: '4 子库 · 296 卡',
    icon: BookOpenText,
  },
];

export default function QuestionBankTab() {
  const router = useRouter();
  return (
    <TabPlaceholderScreen
      entries={entries}
      eyebrow="ICAO Learning"
      subtitle="跟着课程计划，逐个攻克核心模块。"
      title="稳步进阶，冲刺目标等级"
      onEntryPress={(entry) => {
        router.push({ pathname: '/question-bank/[bankId]', params: { bankId: entry.slug } });
      }}
    />
  );
}
