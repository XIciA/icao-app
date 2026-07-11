import { getRecordingPermissionsAsync, requestRecordingPermissionsAsync } from 'expo-audio';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Bell, BookOpen, CalendarClock, ChevronRight, CloudAlert, Construction, Flame, LoaderCircle, Megaphone, Mic, MicOff, Plane, Radio, RefreshCw, RotateCcw, ShieldCheck, WifiOff, Wrench, X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, View } from 'react-native';

import { TopBar } from '@/components/navigation/TopBar';
import { AppText, Button, Card, Screen } from '@/components/ui';
import { SoftGlow } from '@/components/visual/SoftGlow';
import { colors, radii, spacing } from '@/theme';

type StateSlug = 'gallery' | 'microphone' | 'mic-denied' | 'notifications' | 'offline' | 'load-failed' | 'maintenance' | 'loading';
const pages: StateSlug[] = ['gallery', 'microphone', 'mic-denied', 'notifications', 'offline', 'load-failed', 'maintenance', 'loading'];

export function SystemStateScreen() {
  const { slug } = useLocalSearchParams<{ slug: StateSlug }>();
  const page: StateSlug = pages.includes(slug) ? slug : 'gallery';
  if (page === 'gallery') return <Gallery />;
  if (page === 'microphone') return <MicrophonePermission />;
  if (page === 'mic-denied') return <MicrophoneDenied />;
  if (page === 'notifications') return <NotificationPermission />;
  if (page === 'loading') return <GlobalLoading />;
  return <FailureState page={page} />;
}

function Gallery() {
  const router = useRouter();
  return <Screen scroll contentStyle={styles.screen}><TopBar title="权限与状态" /><View style={styles.content}><Section title="权限请求"><Row icon={Mic} label="麦克风权限说明" first onPress={() => router.push('/state/microphone')} /><Row danger icon={MicOff} label="麦克风被拒绝" onPress={() => router.push('/state/mic-denied')} /><Row icon={Bell} label="通知权限说明" onPress={() => router.push('/state/notifications')} /></Section><Section title="异常与加载状态"><Row muted icon={WifiOff} label="无网络" first onPress={() => router.push('/state/offline')} /><Row danger icon={CloudAlert} label="加载失败" onPress={() => router.push('/state/load-failed')} /><Row icon={Wrench} label="服务维护中" onPress={() => router.push('/state/maintenance')} /><Row icon={LoaderCircle} label="全局加载页" onPress={() => router.push('/state/loading')} /></Section></View></Screen>;
}

function StatePage({ children }: { children: React.ReactNode }) { const router = useRouter(); return <Screen contentStyle={styles.stateScreen}><Pressable accessibilityLabel="关闭" hitSlop={10} onPress={router.back} style={styles.close}><X color={colors.mutedForeground} size={18} /></Pressable>{children}</Screen>; }

function MicrophonePermission() {
  const router = useRouter(); const [allowing, setAllowing] = useState(false);
  async function allow() { setAllowing(true); await requestRecordingPermissionsAsync(); setAllowing(false); router.back(); }
  return <StatePage><View style={styles.permission}><StateHero icon={Mic} /><AppText variant="sectionTitle">开启麦克风权限</AppText><AppText style={styles.center}>口语练习需要录制你的语音。松开按钮后，本次录音会提交至语音服务，并经识别结果填入「我的回答」。</AppText><View style={styles.reasons}><Reason icon={BookOpen} title="按住说话，松开转写" body="录音只在按住期间进行，松开后自动结束。" /><Reason icon={Radio} title="ICAO 英语识别" body="当前为界面演示，真实 ASR 服务待接入。" /><Reason icon={ShieldCheck} title="用途清晰" body="演示录音仅保存在本机应用空间。" /></View></View><View style={styles.footer}><Button disabled={allowing} leading={allowing ? <ActivityIndicator color={colors.primaryForeground} /> : undefined} onPress={() => void allow()} size="lg">{allowing ? '正在请求…' : '允许使用麦克风'}</Button><Button disabled={allowing} onPress={router.back} size="lg" variant="outline">暂不开启</Button></View></StatePage>;
}

function MicrophoneDenied() {
  const [checking, setChecking] = useState(false);
  async function retry() { setChecking(true); const result = await getRecordingPermissionsAsync(); setChecking(false); if (!result.granted) await Linking.openSettings(); }
  return <StatePage><View style={styles.centered}><StateHero icon={MicOff} tone="danger" /><AppText variant="sectionTitle">无法使用麦克风</AppText><AppText style={styles.center}>请在当前设备的应用设置中允许使用麦克风，然后返回这里重新检测。</AppText><Card style={styles.steps}>{['打开当前应用或页面的权限设置', '将「麦克风」改为允许', '返回页面并重新检测'].map((item, index) => <View key={item} style={styles.step}><View style={styles.stepNo}><AppText color={colors.primary} variant="micro">{index + 1}</AppText></View><AppText style={styles.flex}>{item}</AppText></View>)}</Card></View><View style={styles.footer}><Button disabled={checking} leading={<RefreshCw color={colors.primaryForeground} size={16} />} onPress={() => void retry()} size="lg">{checking ? '正在检测…' : '我已开启，重新检测'}</Button><Button onPress={() => void Linking.openSettings()} size="lg" variant="outline">稍后再说</Button></View></StatePage>;
}

function NotificationPermission() {
  const router = useRouter();
  return <StatePage><View style={styles.permission}><StateHero icon={Bell} /><AppText variant="sectionTitle">开启学习提醒</AppText><AppText style={styles.center}>允许发送通知，我们会在合适的时候提醒复习，帮你保持备考节奏。不推送重复更新。</AppText><View style={styles.reasons}><Reason icon={CalendarClock} title="每日复习提醒" body="按你的计划提醒当日的背题与跟读任务。" /><Reason icon={Flame} title="连续打卡不中断" body="快断签时轻提醒一下，守住你的连胜。" /><Reason icon={Megaphone} title="考点与资讯更新" body="真实通知服务暂未接入，当前仅展示 UI。" /></View></View><View style={styles.footer}><Button onPress={() => void Linking.openSettings()} size="lg">开启通知</Button><Button onPress={router.back} size="lg" variant="outline">暂不开启</Button></View></StatePage>;
}

function FailureState({ page }: { page: 'offline' | 'load-failed' | 'maintenance' }) {
  const router = useRouter(); const [recovered, setRecovered] = useState(false);
  if (recovered) return <StatePage><View style={styles.centered}><StateHero icon={RefreshCw} /><AppText variant="sectionTitle">重新加载成功</AppText><AppText style={styles.center}>本次仅恢复演示状态，没有发起真实网络请求。</AppText></View><View style={styles.footer}><Button onPress={() => setRecovered(false)} size="lg">再次查看失败态</Button></View></StatePage>;
  const data = page === 'offline' ? { icon: WifiOff, title: '网络连接已断开', body: '似乎无法连接到网络。请检查 Wi-Fi 或移动数据，然后重试，已下载的内容仍可离线学习。', main: '重新连接', secondary: '查看离线内容', tone: 'muted' as const } : page === 'load-failed' ? { icon: CloudAlert, title: '加载失败', body: '页面内容加载出错了，可能是网络波动或服务器繁忙。请稍后重试。', main: '重新加载', secondary: '返回上一页', tone: 'danger' as const } : { icon: Construction, title: '服务升级维护中', body: '我们正在对服务器进行升级维护，以带来更稳定流畅的学习体验。期间部分功能暂不可用，敬请谅解。', main: '刷新重试', secondary: '', tone: 'accent' as const };
  return <StatePage><View style={styles.centered}><StateHero icon={data.icon} tone={data.tone} /><AppText variant="sectionTitle">{data.title}</AppText><AppText style={styles.center}>{data.body}</AppText>{page === 'load-failed' ? <AppText variant="micro">错误码：ERR_CONTENT_500</AppText> : null}{page === 'maintenance' ? <View style={styles.maintenancePill}><Wrench color={colors.accent} size={15} /><AppText variant="caption">恢复时间以服务状态为准</AppText></View> : null}</View><View style={styles.footer}><Button leading={<RotateCcw color={colors.primaryForeground} size={16} />} onPress={() => setRecovered(true)} size="lg">{data.main}</Button>{data.secondary ? <Button onPress={router.back} size="lg" variant="outline">{data.secondary}</Button> : null}</View></StatePage>;
}

function GlobalLoading() {
  const router = useRouter(); useEffect(() => undefined, []);
  return <Pressable accessibilityLabel="返回" onPress={router.back} style={styles.loading}><SoftGlow intensity={0.9} size={390} style={styles.loadingGlow} /><View style={styles.loadingContent}><View style={styles.brand}><Plane color={colors.primaryForeground} size={28} style={{ transform: [{ rotate: '-45deg' }] }} /></View><AppText variant="sectionTitle">飞猪 ICAO</AppText><ActivityIndicator color={colors.primary} size="large" /><AppText variant="caption">正在加载，请稍候…</AppText></View><AppText style={styles.loadingFoot} variant="micro">Aviation English · v3.2.0</AppText></Pressable>;
}

function StateHero({ icon: Icon, tone = 'primary' }: { icon: typeof Mic; tone?: 'primary' | 'danger' | 'accent' | 'muted' }) { const color = tone === 'danger' ? colors.destructive : tone === 'accent' ? colors.accent : tone === 'muted' ? colors.mutedForeground : colors.primary; const bg = tone === 'danger' ? 'rgba(219,43,51,0.10)' : tone === 'accent' ? 'rgba(181,121,36,0.12)' : colors.primary10; return <View style={[styles.hero, { backgroundColor: bg }]}><Icon color={color} size={34} /></View>; }
function Reason({ icon: Icon, title, body }: { icon: typeof Mic; title: string; body: string }) { return <Card style={styles.reason}><View style={styles.reasonIcon}><Icon color={colors.primary} size={16} /></View><View style={styles.flex}><AppText variant="button">{title}</AppText><AppText variant="micro">{body}</AppText></View></Card>; }
function Section({ title, children }: { title: string; children: React.ReactNode }) { return <View style={styles.section}><AppText variant="caption">{title}</AppText><Card style={styles.rows}>{children}</Card></View>; }
function Row({ icon: Icon, label, onPress, first = false, danger = false, muted = false }: { icon: typeof Mic; label: string; onPress: () => void; first?: boolean; danger?: boolean; muted?: boolean }) { return <Pressable onPress={onPress}><View style={[styles.row, !first && styles.border]}><View style={[styles.rowIcon, danger && styles.rowDanger, muted && styles.rowMuted]}><Icon color={danger ? colors.destructive : muted ? colors.mutedForeground : colors.primary} size={16} /></View><AppText style={styles.flex} variant="button">{label}</AppText><ChevronRight color={colors.mutedForeground} size={16} /></View></Pressable>; }

const styles = StyleSheet.create({
  screen: { paddingHorizontal: 0 }, content: { gap: spacing[5], padding: spacing[4] }, section: { gap: spacing[2] }, rows: { padding: 0 }, row: { alignItems: 'center', flexDirection: 'row', gap: spacing[3], minHeight: 58, paddingHorizontal: spacing[3] }, border: { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth }, rowIcon: { alignItems: 'center', backgroundColor: colors.primary10, borderRadius: radii.md, height: 34, justifyContent: 'center', width: 34 }, rowDanger: { backgroundColor: 'rgba(219,43,51,0.08)' }, rowMuted: { backgroundColor: colors.secondary }, flex: { flex: 1 }, stateScreen: { paddingHorizontal: 0, position: 'relative' }, close: { alignItems: 'center', height: 44, justifyContent: 'center', position: 'absolute', right: spacing[2], top: spacing[1], width: 44, zIndex: 2 }, permission: { alignItems: 'center', flex: 1, gap: spacing[3], paddingHorizontal: spacing[5], paddingTop: spacing[10] }, centered: { alignItems: 'center', flex: 1, gap: spacing[3], justifyContent: 'center', padding: spacing[8] }, center: { lineHeight: 21, textAlign: 'center' }, hero: { alignItems: 'center', borderRadius: radii.xxl, height: 82, justifyContent: 'center', marginBottom: spacing[2], width: 82 }, reasons: { gap: spacing[2.5], marginTop: spacing[3], width: '100%' }, reason: { alignItems: 'center', flexDirection: 'row', gap: spacing[3], padding: spacing[3] }, reasonIcon: { alignItems: 'center', backgroundColor: colors.primary10, borderRadius: radii.md, height: 34, justifyContent: 'center', width: 34 }, footer: { gap: spacing[2.5], padding: spacing[5], paddingTop: spacing[3] }, steps: { gap: spacing[3], marginTop: spacing[3], width: '100%' }, step: { alignItems: 'center', flexDirection: 'row', gap: spacing[3] }, stepNo: { alignItems: 'center', backgroundColor: colors.primary10, borderRadius: radii.full, height: 24, justifyContent: 'center', width: 24 }, maintenancePill: { alignItems: 'center', backgroundColor: colors.card, borderColor: colors.border, borderRadius: radii.full, borderWidth: 1, flexDirection: 'row', gap: spacing[2], marginTop: spacing[3], paddingHorizontal: spacing[4], paddingVertical: spacing[2] }, loading: { backgroundColor: colors.background, flex: 1, overflow: 'hidden', position: 'relative' }, loadingGlow: { left: -8, top: -210 }, loadingContent: { alignItems: 'center', flex: 1, gap: spacing[5], justifyContent: 'center' }, brand: { alignItems: 'center', backgroundColor: colors.primary, borderRadius: radii.full, height: 62, justifyContent: 'center', width: 62 }, loadingFoot: { bottom: spacing[8], position: 'absolute', textAlign: 'center', width: '100%' },
});
