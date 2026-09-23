import { usePathname } from 'expo-router';
import { useEffect, useState } from 'react';
import { AppState, Platform, View } from 'react-native';
import { AppText, BottomSheet, Button } from '@/components/ui';
import { colors, spacing } from '@/theme';
import { checkAppUpdate, dismissAppUpdate, openAppUpdate } from './app-updates.native';
import type { AppUpdate } from './update-model';

export function AppUpdatePrompt({ manual = false }: { manual?: boolean }) {
  const pathname = usePathname();
  const [update, setUpdate] = useState<AppUpdate>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  // Learning, recording, editing, payment and AI routes never show an automatic prompt.
  const safe = manual || ['/', '/home', '/profile', '/question-bank'].includes(pathname);
  const native = Platform.OS === 'ios' || Platform.OS === 'android';
  useEffect(() => {
    if (manual || !safe || !native) return;
    let active = true;
    const run = () => { void checkAppUpdate().then((value) => { if (active) setUpdate(value); }).catch(() => undefined); };
    run();
    const subscription = AppState.addEventListener('change', (state) => { if (state === 'active') run(); });
    return () => { active = false; subscription.remove(); };
  }, [manual, native, safe]);
  if (!native) return null;
  async function check() {
    if (busy) return;
    setBusy(true); setMessage('');
    try { const next = await checkAppUpdate(true); setUpdate(next); if (!next) setMessage('当前渠道暂无可用的新版本。'); }
    catch { setMessage('暂时无法检查更新，请稍后重试。'); }
    finally { setBusy(false); }
  }
  function later() { if (update) void dismissAppUpdate(update).catch(() => undefined); setUpdate(undefined); }
  return <>
    {manual ? <View style={{ gap: spacing[2] }}><Button variant="outline" disabled={busy} onPress={() => { void check(); }}>{busy ? '正在检查…' : '检查更新'}</Button>{message ? <AppText variant="caption">{message}</AppText> : null}</View> : null}
    {update && safe ? <BottomSheet visible onClose={later}>
      {update ? <View style={{ gap: spacing[3] }}>
        <AppText variant="sectionTitle">发现新版本 {update.version}</AppText>
        <AppText>{update.notes}</AppText>
        <AppText variant="micro">{update.channel === 'ios-testflight' ? '在 TestFlight 中更新测试版本。' : update.channel === 'android-apk' ? '下载新版安装包并覆盖安装，保留账号与学习数据。' : '前往 App Store 更新。'}</AppText>
        {message ? <AppText color={colors.destructive} variant="caption">{message}</AppText> : null}
        <Button onPress={() => { void openAppUpdate(update).catch(() => setMessage('无法打开更新入口，请稍后重试。')); }}>立即更新</Button>
        <Button variant="outline" onPress={later}>稍后再说</Button>
      </View> : null}
    </BottomSheet> : null}
  </>;
}
