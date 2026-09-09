import { type Href, useRouter } from 'expo-router';
import { Component, type PropsWithChildren, type ReactNode } from 'react';
import { StyleSheet } from 'react-native';

import { TopBar } from '@/components/navigation/TopBar';
import { Button, Screen } from '@/components/ui';
import { spacing } from '@/theme';
import { CenteredState } from './CenteredState';

type Props = PropsWithChildren<{
  title: string;
  fallbackHref?: Href;
  onExit?: () => void;
  resetKey?: string;
  allowExit?: boolean;
}>;

/** Keep the navigator mounted when a business screen fails to render. */
export function NativeScreenBoundary({ title, fallbackHref = '/(tabs)', onExit, resetKey, allowExit = true, children }: Props) {
  const router = useRouter();
  const exit = onExit ?? (() => {
    if (router.canGoBack()) router.back();
    else router.replace(fallbackHref);
  });
  return <ScreenBoundary key={resetKey} fallback={(retry) => (
    <Screen contentStyle={styles.screen}>
      {allowExit ? <TopBar title={title} onBack={exit} /> : null}
      <CenteredState
        title="页面暂时无法显示"
        description="可以重新加载，或返回后再试。"
        actionLabel="重新加载"
        onAction={retry}
        secondary={allowExit ? <Button onPress={exit} style={styles.returnButton} variant="outline">返回</Button> : undefined}
      />
    </Screen>
  )}>{children}</ScreenBoundary>;
}

class ScreenBoundary extends Component<PropsWithChildren<{ fallback: (retry: () => void) => ReactNode }>, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed
      ? this.props.fallback(() => this.setState({ failed: false }))
      : this.props.children;
  }
}

const styles = StyleSheet.create({ screen: { paddingHorizontal: 0 }, returnButton: { marginTop: spacing[3], minWidth: 160 } });
