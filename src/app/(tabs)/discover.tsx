import { BookMarked, Radio, Sparkles } from 'lucide-react-native';

import { TabPlaceholderScreen } from '@/components/screens/TabPlaceholderScreen';

const entries = [
  {
    slug: 'vocabulary',
    title: '单词学习',
    description: '航空高频词汇记忆与测试。',
    meta: '全屏子页导航验证入口',
    icon: BookMarked,
  },
  {
    slug: 'radio',
    title: '随身听',
    description: '碎片时间沉浸式磨耳朵。',
    meta: '完整播放器将在后续阶段复刻',
    icon: Radio,
    enabled: false,
  },
  {
    slug: 'ai-tools',
    title: 'AI 学习工具',
    description: '模考、报告与辅助学习能力入口。',
    meta: '遵守 Phase 1 Mock 边界',
    icon: Sparkles,
    enabled: false,
  },
];

export default function DiscoverTab() {
  return <TabPlaceholderScreen entries={entries} subtitle="功能、资源与课程，探索更多学习方式。" title="发现" />;
}
