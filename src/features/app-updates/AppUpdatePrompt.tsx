import { membershipReminder } from './membership-reminder';
import Storage from '@/platform/storage';
import { useAuth } from '@/features/auth/AuthProvider';
import { useCommerceRuntime } from '@/features/native-commercial-testflight/CommerceRuntimeProvider';
import { audioSessionOrchestrator } from '@/platform/audio';
import { usePathname, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { AppState, Platform, View } from 'react-native';
import { AppText, BottomSheet, Button } from '@/components/ui';
import { colors, spacing } from '@/theme';
import { checkAppUpdate, dismissAppUpdate, openAppUpdate } from './app-updates.native';
import type { AppUpdate } from './update-model';

export function AppUpdatePrompt({ manual = false }: { manual?: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const auth = useAuth();
  const commerce = useCommerceRuntime();
  const accountId = auth.account?.accountId;
  const expiry = commerce.entitlement?.membership.expiresAt;
  const environment = commerce.entitlement?.environment;
  const [reminder,setReminder] = useState<ReturnType<typeof membershipReminder>>();
  const shownThisEntry = useRef(false);
  const [entry,setEntry] = useState(0);
  const [update, setUpdate] = useState<AppUpdate>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  // Learning, recording, editing, payment and AI routes never show an automatic prompt.
  const safe = manual || ['/', '/home'].includes(pathname);
  const native = Platform.OS === 'ios' || Platform.OS === 'android';
  useEffect(() => {
    if (!safe) { shownThisEntry.current = false; setReminder(undefined); setUpdate(undefined); }
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') { shownThisEntry.current = false; setEntry(value => value + 1); } });
    return () => subscription.remove();
  }, [safe]);
  useEffect(() => { shownThisEntry.current = false; setReminder(undefined); setUpdate(undefined); }, [accountId, environment]);
  useEffect(() => { setReminder(current => current?.expiresAt === expiry ? current : undefined); }, [expiry]);
  useEffect(() => {
    if (manual || !safe || !accountId || shownThisEntry.current || commerce.phase === 'loading' || commerce.phase === 'reconciling') return;
    let active = true;
    const run = async () => {
      if (audioSessionOrchestrator.getActiveOwner()) return;
      const candidate = membershipReminder(expiry);
      if (candidate) {
        const key = `icao.membership-reminder.v1.${accountId}.${environment}.${candidate.expiresAt}.${candidate.phase}`;
        const seen = await Storage.getItem(key);
        if (!active || audioSessionOrchestrator.getActiveOwner()) return;
        if (!seen) { await Storage.setItem(key, '1'); if (active && !audioSessionOrchestrator.getActiveOwner()) { shownThisEntry.current = true; setReminder(candidate); } return; }
      }
      if (!native) return;
      const next = await checkAppUpdate();
      if (active && next && !audioSessionOrchestrator.getActiveOwner()) { await dismissAppUpdate(next); if (active) { shownThisEntry.current = true; setUpdate(next); } }
    };
    void run().catch(() => undefined);
    return () => { active = false; };
  }, [accountId, commerce.phase, entry, environment, expiry, manual, native, safe]);
  async function check() {
    if (busy) return;
    setBusy(true); setMessage('');
    try { const next = await checkAppUpdate(true); setUpdate(next); if (!next) setMessage('当前渠道暂无可用的新版本。'); }
    catch { setMessage('暂时无法检查更新，请稍后重试。'); }
    finally { setBusy(false); }
  }
  function later() { if (update) void dismissAppUpdate(update).catch(() => undefined); setUpdate(undefined); }
  return <>
    {reminder && safe && !manual ? <BottomSheet visible onClose={() => setReminder(undefined)}><View style={{gap:spacing[3]}}><AppText variant="sectionTitle">{reminder.phase === 'expired' ? '会员已到期' : '会员即将到期'}</AppText><AppText>到期日期：{new Date(reminder.expiresAt).toLocaleDateString('zh-CN')}</AppText><AppText variant="caption">续费后可继续使用会员题库和服务，已有学习记录会为你保留。</AppText><Button onPress={() => { setReminder(undefined); router.push('/account/membership'); }}>去续费</Button><Button variant="outline" onPress={() => setReminder(undefined)}>暂时不用</Button></View></BottomSheet> : null}
    {manual ? <View style={{ gap: spacing[2] }}><Button variant="outline" disabled={busy} onPress={() => { void check(); }}>{busy ? '正在检查…' : '检查更新'}</Button>{message ? <AppText variant="caption">{message}</AppText> : null}</View> : null}
    {update && safe && !reminder ? <BottomSheet visible onClose={later}>
      {update ? <View style={{ gap: spacing[3] }}>
        <AppText variant="sectionTitle">发现新版本 {update.version}</AppText>
        <AppText>{update.notes}</AppText>
        <AppText variant="micro">{update.channel === 'ios-testflight' ? '在 TestFlight 中更新测试版本。' : (update.channel === 'android-apk' || update.channel === 'android-test') ? '下载新版安装包并覆盖安装，保留账号与学习数据。' : '前往 App Store 更新。'}</AppText>
        {message ? <AppText color={colors.destructive} variant="caption">{message}</AppText> : null}
        <Button onPress={() => { void openAppUpdate(update).catch(() => setMessage('无法打开更新入口，请稍后重试。')); }}>去更新</Button>
        <Button variant="outline" onPress={later}>稍后再说</Button>
      </View> : null}
    </BottomSheet> : null}
  </>;
}
