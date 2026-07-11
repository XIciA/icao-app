import { Headphones, MessageSquareQuote, RadioTower } from 'lucide-react-native';

import { TabPlaceholderScreen } from '@/components/screens/TabPlaceholderScreen';

const entries = [
  {
    slug: 'listening',
    title: '听力',
    description: '真实陆空通话情境的听力理解训练。',
    meta: '阶段 2 将接入首条真实学习链路',
    icon: Headphones,
  },
  {
    slug: 'sentences900',
    title: '900 句',
    description: '民航英语高频句型跟读与记忆。',
    meta: '导航与共享组件已经就绪',
    icon: MessageSquareQuote,
    enabled: false,
  },
  {
    slug: 'radiotelephony',
    title: '陆空通话',
    description: '标准通话用语与特情处置表达训练。',
    meta: '导航与共享组件已经就绪',
    icon: RadioTower,
    enabled: false,
  },
];

export default function QuestionBankTab() {
  return (
    <TabPlaceholderScreen
      entries={entries}
      eyebrow="ICAO Learning"
      subtitle="跟着课程计划，逐个攻克核心模块。"
      title="稳步进阶，冲刺目标等级"
    />
  );
}
