import { Platform } from 'react-native';
import { isFormalAppSurface } from '@/config/web-runtime';
import { useGuide } from '@/features/usage-guide/GuideBindings';
import {
  createMaterialTopTabNavigator,
  type MaterialTopTabNavigationEventMap,
  type MaterialTopTabNavigationOptions,
} from '@react-navigation/material-top-tabs';
import type { ParamListBase, TabNavigationState } from '@react-navigation/native';
import { withLayoutContext } from 'expo-router';

import { FloatingTabBar } from '@/components/navigation/FloatingTabBar';
import { colors } from '@/theme';

const MaterialTopTabs = createMaterialTopTabNavigator();

const SwipeTabs = withLayoutContext<
  MaterialTopTabNavigationOptions,
  typeof MaterialTopTabs.Navigator,
  TabNavigationState<ParamListBase>,
  MaterialTopTabNavigationEventMap
>(MaterialTopTabs.Navigator);

export default function TabLayout() {
  const guide = useGuide();
  // Native PagerView applies guide jumps without a page animation. Animated
  // setPage can leave the selected tab ahead of the visible page after a pop.
  const animationEnabled = !(isFormalAppSurface(Platform.OS) && guide?.current);
  return (
    <SwipeTabs
      backBehavior="history"
      initialRouteName="index"
      screenOptions={{
        animationEnabled,
        lazy: true,
        lazyPreloadDistance: 1,
        sceneStyle: { backgroundColor: colors.background },
        swipeEnabled: true,
      }}
      tabBarPosition="bottom"
      tabBar={(props) => <FloatingTabBar {...props} />}
    >
      <SwipeTabs.Screen name="index" options={{ title: '题库' }} />
      <SwipeTabs.Screen name="discover" options={{ title: '发现' }} />
      <SwipeTabs.Screen name="profile" options={{ title: '我的' }} />
    </SwipeTabs>
  );
}
