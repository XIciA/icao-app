import { membershipReminder } from './membership-reminder';
import Storage from '@/platform/storage';
import { useAuth } from '@/features/auth/AuthProvider';
import { useCommerceRuntime } from '@/features/native-commercial-testflight/CommerceRuntimeProvider';
import { audioSessionOrchestrator } from '@/platform/audio';
import { usePathname } from 'expo-router';
import { useAppRouter as useRouter } from '@/components/navigation/useAppRouter';
import { useEffect, useRef, useState } from 'react';
import { AppState, Platform, View } from 'react-native';
import { AppText, BottomSheet, Button } from '@/components/ui';
import { colors, spacing } from '@/theme';
import { checkAppUpdate, dismissAppUpdate, openAppUpdate } from './app-updates.native';
import type { AppUpdate } from './update-model';
import { downloadAndroidUpdate, installAndroidUpdate } from './android-update.native';

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
  const [downloadProgress, setDownloadProgress] = useState<number>();
  const [downloaded, setDownloaded] = useState<{ key: string; uri: string }>();
  const [installBusy, setInstallBusy] = useState(false);
  const installLock = useRef(false);
  const downloadController = useRef<AbortController | undefined>(undefined);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; downloadController.current?.abort(); };
  }, []);
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
  async function goUpdate() {
    if (!update || installLock.current) return;
    if (Platform.OS !== 'android') {
      await openAppUpdate(update).catch(() => setMessage('无法打开更新入口，请稍后重试。'));
      return;
    }
    installLock.current = true;
    setInstallBusy(true); setMessage('');
    const controller = new AbortController();
    downloadController.current = controller;
    try {
      const key = `${update.channel}:${update.build}:${update.url}`;
      let uri = downloaded?.key === key ? downloaded.uri : undefined;
      if (!uri) {
        setDownloadProgress(0);
        uri = await downloadAndroidUpdate(update, setDownloadProgress, controller.signal);
        if (!mounted.current || controller.signal.aborted) return;
        setDownloaded({ key, uri });
      }
      setDownloadProgress(undefined);
      setMessage('正在校验安装包…');
      const result = await installAndroidUpdate(update, uri);
      if (mounted.current) setMessage(result === 'permission-required'
        ? '请允许安装此来源的应用，返回后点击“继续安装”。'
        : '已打开系统安装界面。如未完成安装，可点击“继续安装”。');
    } catch {
      if (mounted.current && !controller.signal.aborted) {
        setDownloaded(undefined);
        setMessage('下载或安装未完成，请检查网络、存储空间和安装权限后重试。');
      }
    } finally {
      installLock.current = false;
      downloadController.current = undefined;
      if (mounted.current) { setInstallBusy(false); setDownloadProgress(undefined); }
    }
  }
  function later() { if (installLock.current) return; if (update) void dismissAppUpdate(update).catch(() => undefined); setUpdate(undefined); }
  return <>
    {reminder && safe && !manual ? <BottomSheet visible onClose={() => setReminder(undefined)}><View style={{gap:spacing[3]}}><AppText variant="sectionTitle">{reminder.phase === 'expired' ? '会员已到期' : '会员即将到期'}</AppText><AppText>到期日期：{new Date(reminder.expiresAt).toLocaleDateString('zh-CN')}</AppText><AppText variant="caption">续费后可继续使用会员题库和服务，已有学习记录会为你保留。</AppText><Button onPress={() => { setReminder(undefined); router.push('/account/membership'); }}>去续费</Button><Button variant="outline" onPress={() => setReminder(undefined)}>暂时不用</Button></View></BottomSheet> : null}
    {manual ? <View style={{ gap: spacing[2] }}><Button variant="outline" disabled={busy} onPress={() => { void check(); }}>{busy ? '正在检查…' : '检查更新'}</Button>{message && !update ? <AppText variant="caption">{message}</AppText> : null}</View> : null}
    {update && safe && !reminder ? <BottomSheet visible onClose={later}>
      {update ? <View style={{ gap: spacing[3] }}>
        <AppText variant="sectionTitle">发现新版本 {update.version}</AppText>
        <AppText>{update.notes}</AppText>
        <AppText variant="micro">{update.channel === 'ios-testflight' ? '在 TestFlight 中更新测试版本。' : (update.channel === 'android-apk' || update.channel === 'android-test') ? '在应用内下载新版，完成后由系统确认覆盖安装，保留账号与学习数据。' : '前往 App Store 更新。'}</AppText>
        {downloadProgress !== undefined ? <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.floor(downloadProgress * 100) }} style={{ gap: spacing[2] }}>
          <AppText variant="caption">正在下载 {Math.floor(downloadProgress * 100)}%</AppText>
          <View style={{ height: spacing[1], backgroundColor: colors.muted, borderRadius: spacing[1], overflow: 'hidden' }}>
            <View style={{ height: spacing[1], width: `${downloadProgress * 100}%`, backgroundColor: colors.primary }} />
          </View>
        </View> : null}
        {message ? <AppText variant="caption">{message}</AppText> : null}
        <Button disabled={installBusy} onPress={() => { void goUpdate(); }}>{installBusy ? downloadProgress !== undefined ? '正在下载…' : '正在准备安装…' : Platform.OS === 'android' ? downloaded ? '继续安装' : '下载并安装' : '去更新'}</Button>
        {downloadProgress !== undefined ? <Button variant="outline" onPress={() => downloadController.current?.abort()}>取消下载</Button>
          : <Button variant="outline" disabled={installBusy} onPress={later}>稍后再说</Button>}
      </View> : null}
    </BottomSheet> : null}
  </>;
}
