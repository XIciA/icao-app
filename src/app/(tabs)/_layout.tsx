import { Tabs } from 'expo-router';

import { FloatingTabBar } from '@/components/navigation/FloatingTabBar';
import { colors } from '@/theme';

export default function TabLayout() {
  return (
    <Tabs
      backBehavior="history"
      screenOptions={{
        animation: 'fade',
        headerShown: false,
        sceneStyle: { backgroundColor: colors.background },
      }}
      tabBar={(props) => <FloatingTabBar {...props} />}
    >
      <Tabs.Screen name="index" options={{ title: '题库' }} />
      <Tabs.Screen name="discover" options={{ title: '发现' }} />
      <Tabs.Screen name="profile" options={{ title: '我的' }} />
    </Tabs>
  );
}
