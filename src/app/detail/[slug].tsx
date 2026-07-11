import { useLocalSearchParams } from 'expo-router';
import { Construction } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { TopBar } from '@/components/navigation/TopBar';
import { CenteredState } from '@/components/states/CenteredState';
import { Screen } from '@/components/ui';

const titles: Record<string, string> = {
  listening: '听力',
  vocabulary: '单词学习',
  'profile-detail': '个人资料',
};

export default function FoundationDetailScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const title = titles[slug] ?? '功能页面';

  return (
    <Screen contentStyle={styles.screen}>
      <TopBar title={title} />
      <View style={styles.content}>
        <CenteredState
          description="当前阶段只建立原生全屏导航、返回手势与共享状态容器；完整业务内容会按路线图进入对应阶段。"
          icon={Construction}
          title={`${title}基础壳已就绪`}
          tone="accent"
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: 0 },
  content: { flex: 1 },
});
