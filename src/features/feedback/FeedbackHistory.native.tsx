import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import type { MyFeedbackDetail, MyFeedbackItem } from '@icao/contracts/feedback-ops';
import { AppText, Button, Card, Screen } from '@/components/ui';
import { TopBar } from '@/components/navigation/TopBar';
import { colors, spacing } from '@/theme';
import { useAuth } from '@/features/auth/AuthProvider';
import { getMyFeedback, listMyFeedback, markFeedbackRead } from './feedback-history-client.native';

const category: Record<string,string> = { feature_suggestion: '功能建议', content_correction: '内容纠错', other: '其他' };
const status: Record<string,string> = { received: '待处理', processing: '处理中', resolved: '已处理' };
const date = (value:string) => new Date(value).toLocaleString('zh-CN', { month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hour12:false });
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
  const [selected,setSelected] = useState<string>();
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
  },[account,selected,page,attempt]));
  const back = () => { if(selected){setSelected(undefined);setPage(undefined);}else router.back(); };
  return <Screen scroll><TopBar title={selected?'反馈详情':'意见反馈'} onBack={back}/>
    {!selected && <Button onPress={() => router.push({pathname:'/info/[slug]',params:{slug:'feedback',compose:'1',source:'profile'}})}>＋ 提交反馈</Button>}
    {error ? <View style={styles.section}><AppText color={colors.destructive}>{error}</AppText><Button variant="ghost" onPress={() => setAttempt(v=>v+1)}>重试</Button></View> : null}
    {busy && <AppText style={styles.section}>正在读取…</AppText>}
    {selected ? detail && <View style={styles.section}>
      <View style={styles.row}><AppText>{category[detail.category] ?? '反馈'}</AppText><AppText color={colors.primary}>{status[detail.status] ?? '待处理'}</AppText></View>
      <AppText variant="caption">{date(detail.createdAt)}</AppText>
      <AppText variant="sectionTitle">我提交的内容</AppText><AppText>{detail.description}</AppText>
      {detail.attachments.map(image => <Image key={image.id} source={{uri:image.url}} resizeMode="contain" style={styles.image} accessibilityLabel="反馈图片"/>)}
      {detail.replies.length>0 && <AppText variant="sectionTitle">处理回复</AppText>}
      {detail.replies.map(reply=><Card key={reply.id}><AppText variant="caption">{date(reply.createdAt)}</AppText><AppText>{reply.text}</AppText></Card>)}
    </View> : <View style={styles.section}>
      {items.map(item=><Pressable key={item.ticketNumber} accessibilityRole="button" onPress={()=>setSelected(item.ticketNumber)}><Card style={styles.section}>
        <View style={styles.row}><AppText variant="button">{category[item.category]??'反馈'}</AppText><AppText>{status[item.status]??'待处理'} {item.unread ? <AppText color={colors.destructive}>●</AppText>:null}</AppText></View>
        <AppText numberOfLines={2}>{item.description}</AppText><AppText variant="caption">{date(item.createdAt)}</AppText>
        {item.replies.length>0 && <AppText numberOfLines={2}>最新回复：{item.replies.at(-1)!.text}</AppText>}
      </Card></Pressable>)}
      {!busy&&!error&&items.length===0&&<AppText>暂无反馈记录</AppText>}
      {cursor&&<Button variant="ghost" disabled={busy} onPress={()=>setPage(cursor)}>查看更多</Button>}
    </View>}
  </Screen>;
}
const styles=StyleSheet.create({section:{gap:spacing[3],paddingVertical:spacing[4]},row:{flexDirection:'row',justifyContent:'space-between',alignItems:'center'},image:{width:'100%',height:320}});
