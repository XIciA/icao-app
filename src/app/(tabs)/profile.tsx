import { Bookmark, BookOpenCheck, Settings, UserRound } from 'lucide-react-native';
import { useRouter } from 'expo-router';

import { TabPlaceholderScreen } from '@/components/screens/TabPlaceholderScreen';

const entries = [
  {
    slug: 'profile-detail',
    title: '个人资料',
    description: '查看和维护学习身份信息。',
    meta: '账户页面将在阶段 5 完整复刻',
    icon: UserRound,
  },
  {
    slug: 'learning-records',
    title: '学习记录',
    description: '集中查看学习进度与本地记录。',
    meta: '最近 100 条本地学习报告',
    icon: BookOpenCheck,
  },
  {
    slug: 'annotations',
    title: '我的标注',
    description: '集中查看题目标签、高亮与学习笔记。',
    meta: '按题库保存，仅存当前设备',
    icon: Bookmark,
  },
  {
    slug: 'settings',
    title: '设置',
    description: '账户、安全、通知与应用信息。',
    meta: '页面骨架已纳入对照矩阵',
    icon: Settings,
    enabled: false,
  },
];

export default function ProfileTab() {
  const router = useRouter();
  return <TabPlaceholderScreen entries={entries} subtitle="管理学习记录、个人资料和应用设置。" title="我的" onEntryPress={(entry) => {
    if (entry.slug === 'learning-records') router.push('/learning-records');
    else if (entry.slug === 'annotations') router.push('/annotations');
    else router.push({ pathname: '/detail/[slug]', params: { slug: entry.slug } });
  }} />;
}
