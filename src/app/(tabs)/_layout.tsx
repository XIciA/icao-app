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
  return (
    <SwipeTabs
      backBehavior="history"
      initialRouteName="index"
      screenOptions={{
        animationEnabled: true,
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
