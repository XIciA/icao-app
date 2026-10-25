import { useAppRouter as useRouter } from '@/components/navigation/useAppRouter';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCallback, useState } from 'react';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import type { MyFeedbackDetail, MyFeedbackItem } from '@icao/contracts/feedback-ops';
import { AppText, Button, Card, Screen, Tag } from '@/components/ui';
import { AlertCircle, Check, ChevronRight, Clock3, FileText, MessageCircle, MessageSquareText, Plus, RefreshCw } from '@/components/ui/icons';
import { TopBar } from '@/components/navigation/TopBar';
import { colors, motion, radii, spacing } from '@/theme';
import { useAuth } from '@/features/auth/AuthProvider';
import { getMyFeedback, listMyFeedback, markFeedbackRead } from './feedback-history-client.native';

const category: Record<string,string> = { feature_suggestion: '功能建议', content_correction: '内容纠错', other: '其他' };
const status: Record<string,string> = { received: '待处理', processing: '处理中', resolved: '已处理' };
const date = (value:string) => new Date(value).toLocaleString('zh-CN', { month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hour12:false });

function FeedbackStatus({ value }: { value: string }) {
  const resolved = value === 'resolved';
  const processing = value === 'processing';
  const Icon = resolved ? Check : processing ? RefreshCw : Clock3;
  const color = resolved ? colors.successForeground : processing ? colors.primary : colors.mutedForeground;
  return <Tag size="md" tone={resolved ? 'success' : processing ? 'primary' : 'muted'} leading={<Icon size={14} color={color} />}>
    {status[value] ?? '待处理'}
  </Tag>;
}

function FeedbackImage({ url, multiple }: { url: string; multiple: boolean }) {
  const [ratio, setRatio] = useState(4 / 3);
  const [failed, setFailed] = useState(false);
  if (failed) return <View style={[styles.imageUnavailable, multiple ? styles.thumbnail : styles.singleImage]}>
    <AppText variant="caption">图片暂时无法显示</AppText>
  </View>;
  return <Image source={{ uri: url }} resizeMode="contain" accessibilityLabel="反馈图片"
    style={[styles.image, multiple ? styles.thumbnail : [styles.singleImage, { aspectRatio: ratio }]]}
    onLoad={({ nativeEvent }) => {
      const { width, height } = nativeEvent.source;
      if (width > 0 && height > 0) setRatio(width / height);
    }} onError={() => setFailed(true)} />;
}
export function FeedbackHistory() {
  const auth = useAuth();
  const account = auth.accountReady ? auth.account?.accountId : undefined;
  // Re-mount on account change so no previous account's content survives a switch.
  return <History key={account ?? 'signed-out'} account={account} />;
}
function History({account}:{account?:string}) {
  const router = useRouter();
  const [items,setItems] = useState<MyFeedbackItem[]>([]);
  const [cursor,setCursor] = useState<string|null>(null);
  const { ticket: selected } = useLocalSearchParams<{ ticket?: string }>();
  const insets = useSafeAreaInsets();
  const [detail,setDetail] = useState<MyFeedbackDetail>();
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const [attempt,setAttempt] = useState(0);
  const [page,setPage] = useState<string>();
  useFocusEffect(useCallback(() => {
    const controller = new AbortController();
    setError(''); setBusy(true); setDetail(undefined);
    if (!account) { setBusy(false); return () => controller.abort(); }
    void (async () => {
      if (selected) {
        const value = await getMyFeedback(selected,controller.signal);
        if (controller.signal.aborted) return;
        setDetail(value);
        const last = value.replies.at(-1);
        if (last && value.unread) await markFeedbackRead(selected,last.id,controller.signal);
      } else {
        const value = await listMyFeedback(page,controller.signal);
        if (!controller.signal.aborted) { setItems(old => page ? [...old, ...value.items.filter(row => !old.some(item => item.ticketNumber === row.ticketNumber))] : value.items); setCursor(value.nextCursor); }
      }
    })().catch(() => { if(!controller.signal.aborted)setError('反馈记录读取失败，请重试。'); })
      .finally(() => { if(!controller.signal.aborted)setBusy(false); });
    return () => controller.abort();
  // Manual retry recreates the focused request.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[account,selected,page,attempt]));
  const back = () => { if (router.canGoBack()) router.back(); else router.replace(selected ? '/info/feedback' : '/(tabs)/profile'); };
  return <Screen contentStyle={styles.screen} header={<TopBar title={selected?'反馈详情':'意见反馈'} onBack={back}/>}>
    <ScrollView style={styles.body} contentContainerStyle={[styles.content, { paddingBottom: spacing[4] + (selected ? insets.bottom : 0) }]} showsVerticalScrollIndicator={false}>
      {error ? <Card style={styles.error}>
        <AlertCircle size={24} color={colors.destructive} />
        <AppText color={colors.destructive}>{error}</AppText>
        <Button variant="outline" onPress={() => setAttempt(v=>v+1)}>重试</Button>
      </Card> : null}
      {busy && <View style={styles.loading} accessibilityRole="progressbar" accessibilityLabel="正在读取反馈">
        <ActivityIndicator color={colors.primary} /><AppText>正在读取…</AppText>
      </View>}
      {selected ? detail && <View style={styles.detail}>
        <View style={styles.summary}>
          <View style={styles.row}><AppText variant="button" style={styles.category}>{category[detail.category] ?? '反馈'}</AppText><FeedbackStatus value={detail.status} /></View>
          <AppText>提交于 {new Date(detail.createdAt).getFullYear()}/{date(detail.createdAt)}</AppText>
        </View>
        <Card style={styles.detailCard}>
          <AppText variant="sectionTitle">我提交的内容</AppText>
          <AppText color={colors.foreground} selectable>{detail.description}</AppText>
          {detail.attachments.length > 0 && <View style={styles.attachments}>
            <AppText variant="caption">附图 · {detail.attachments.length} 张</AppText>
            <View style={styles.images}>{detail.attachments.map(image => <FeedbackImage key={image.id} url={image.url} multiple={detail.attachments.length > 1} />)}</View>
          </View>}
        </Card>
        <Card style={styles.detailCard}>
          <AppText variant="sectionTitle">处理回复</AppText>
          {detail.replies.length > 0 ? detail.replies.map((reply, index) => <View key={reply.id} style={[styles.reply, index > 0 ? styles.replyDivider : null]}>
            <View style={styles.replyHeading}><AppText variant="button" color={colors.primary}>听你五个团队</AppText><AppText variant="caption">{date(reply.createdAt)}</AppText></View>
            <AppText color={colors.foreground} selectable>{reply.text}</AppText>
          </View>) : <View style={styles.noReply}>
            <MessageCircle size={20} color={colors.mutedForeground} />
            <AppText style={styles.flex}>暂无回复，可稍后在这里查看。</AppText>
          </View>}
        </Card>
      </View> : <View style={styles.listSection}>
        {items.length > 0 && <Card style={styles.inbox}>
          {items.map((item, index) => {
            const latest = item.replies.at(-1);
            const Icon = item.category === 'content_correction' ? FileText : MessageSquareText;
            return <Pressable key={item.ticketNumber} accessibilityRole="button"
              accessibilityLabel={`${category[item.category] ?? '反馈'}，${status[item.status] ?? '待处理'}，${item.description}${item.unread ? '，有新回复' : ''}`}
              onPress={() => router.push({ pathname: '/info/[slug]', params: { slug: 'feedback', ticket: item.ticketNumber } })}
              style={({ pressed }) => [styles.record, index > 0 ? styles.recordDivider : null, pressed ? styles.pressed : null]}>
              <View style={styles.recordIcon}><Icon size={18} color={colors.primary} /></View>
              <View style={styles.recordMain}>
                <View style={styles.row}><AppText variant="button" style={styles.category}>{category[item.category] ?? '反馈'}</AppText><FeedbackStatus value={item.status} /></View>
                <AppText variant="button" numberOfLines={2}>{item.description}</AppText>
                {latest && <View style={styles.replyPreview}>
                  <View style={styles.previewHeading}><AppText>官方回复</AppText>{item.unread && <AppText variant="caption" color={colors.primary}>· 新回复</AppText>}</View>
                  <AppText numberOfLines={2}>{latest.text}</AppText>
                </View>}
                <View style={styles.row}>
                  <AppText variant="caption">{date(item.createdAt)}</AppText>
                  <ChevronRight size={16} color={colors.mutedForeground} />
                </View>
              </View>
            </Pressable>;
          })}
        </Card>}
        {!busy && !error && items.length === 0 && <View style={styles.empty}>
          <View style={styles.emptyIcon}><MessageCircle size={28} color={colors.primary} /></View>
          <AppText variant="sectionTitle">暂无反馈记录</AppText>
          <AppText>你的反馈和处理回复会显示在这里。</AppText>
        </View>}
        {cursor && <Button variant="ghost" disabled={busy} onPress={()=>setPage(cursor)}>查看更多</Button>}
      </View>}
    </ScrollView>
    {!selected && <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing[4]) }]}><Button size="lg" leading={<Plus size={18} color={colors.primaryForeground} />} onPress={() => router.push({pathname:'/info/[slug]',params:{slug:'feedback',compose:'1',source:'profile'}})}>提交反馈</Button></View>}
  </Screen>;
}
const styles = StyleSheet.create({
  screen: { paddingHorizontal: 0 },
  body: { flex: 1 },
  flex: { flex: 1 },
  content: { paddingHorizontal: spacing[5], paddingTop: spacing[6], flexGrow: 1 },
  footer: { paddingHorizontal: spacing[5], paddingTop: spacing[3], borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, backgroundColor: colors.background },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing[2], flexWrap: 'wrap' },
  category: { flexShrink: 1 },
  listSection: { gap: spacing[3] },
  inbox: { padding: 0, borderRadius: radii.xl, backgroundColor: colors.card, overflow: 'hidden' },
  record: { flexDirection: 'row', gap: spacing[3], paddingHorizontal: spacing[4], paddingVertical: spacing[5] },
  recordDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  recordIcon: { width: 34, height: 34, borderRadius: radii.md, backgroundColor: colors.primary08, alignItems: 'center', justifyContent: 'center' },
  recordMain: { flex: 1, minWidth: 0, gap: spacing[3] },
  pressed: { opacity: 0.88, transform: [{ scale: motion.pressScale }] },
  replyPreview: { backgroundColor: colors.muted, borderRadius: radii.sm, paddingHorizontal: spacing[3], paddingVertical: spacing[2], gap: spacing[1] },
  previewHeading: { flexDirection: 'row', gap: spacing[2], alignItems: 'center', flexWrap: 'wrap' },
  detail: { gap: spacing[4] },
  summary: { gap: spacing[2], marginBottom: spacing[1] },
  detailCard: { borderRadius: radii.lg, backgroundColor: colors.card, gap: spacing[4] },
  reply: { gap: spacing[3] },
  replyHeading: { gap: spacing[1] },
  replyDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: spacing[4] },
  noReply: { backgroundColor: colors.muted, borderRadius: radii.lg, padding: spacing[4], flexDirection: 'row', alignItems: 'center', gap: spacing[3] },
  attachments: { gap: spacing[2], marginTop: spacing[1] },
  images: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] },
  image: { borderRadius: radii.sm, backgroundColor: colors.muted },
  singleImage: { width: '100%', maxHeight: 320, minHeight: 80 },
  thumbnail: { width: 120, height: 96 },
  imageUnavailable: { padding: spacing[3], backgroundColor: colors.muted, borderRadius: radii.sm, justifyContent: 'center', alignItems: 'center' },
  empty: { alignItems: 'center', gap: spacing[3], paddingVertical: spacing[12] },
  emptyIcon: { width: 64, height: 64, borderRadius: radii.xl, backgroundColor: colors.primary08, alignItems: 'center', justifyContent: 'center', marginBottom: spacing[1] },
  loading: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: spacing[2], paddingVertical: spacing[5] },
  error: { alignItems: 'center', gap: spacing[3], borderRadius: radii.lg, marginBottom: spacing[4] },
});
