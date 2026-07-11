import { useLocalSearchParams, useRouter } from 'expo-router';
import { CheckCircle2, ChevronRight, Cloud, LogOut, Shield, Trash2, UserRound } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';

import { TopBar } from '@/components/navigation/TopBar';
import { AppText, BottomSheet, Button, Card, Screen, Tag, TextField } from '@/components/ui';
import { colors, radii, spacing } from '@/theme';

type AccountSlug = 'profile' | 'edit-profile' | 'settings' | 'sync' | 'security' | 'change-phone' | 'change-email' | 'change-password' | 'delete-account';
const titles: Record<AccountSlug, string> = { profile: '个人资料', 'edit-profile': '编辑资料', settings: '设置', sync: '学习同步', security: '账户安全', 'change-phone': '更换手机号', 'change-email': '更换邮箱', 'change-password': '修改密码', 'delete-account': '注销账户' };

export function AccountScreen() {
  const { slug } = useLocalSearchParams<{ slug: AccountSlug }>();
  const page = titles[slug] ? slug : 'profile';
  if (page === 'profile') return <ProfilePage />;
  if (page === 'edit-profile') return <EditProfilePage />;
  if (page === 'settings') return <SettingsPage />;
  if (page === 'sync') return <SyncPage />;
  if (page === 'security') return <SecurityPage />;
  return <SecurityForm page={page} />;
}

function ProfilePage() {
  const router = useRouter();
  return <Screen scroll contentStyle={styles.screen}><TopBar title="个人资料" /><View style={styles.hero}><View style={styles.avatar}><UserRound color={colors.primary} size={32} /></View><AppText variant="pageTitle">飞行学员</AppText><Tag>演示账户 · 本地数据</Tag></View><Card style={styles.list}><Info label="学习目标" value="ICAO 4 级" /><Info label="当前院校" value="未设置" border /><Info label="注册时间" value="2026 年 7 月" border /></Card><View style={styles.block}><Button onPress={() => router.push('/account/edit-profile')} size="lg">编辑资料</Button><Button onPress={() => router.push('/auth/login')} variant="outline">切换到登录演示</Button></View></Screen>;
}

function EditProfilePage() {
  const router = useRouter(); const [name, setName] = useState('飞行学员'); const [school, setSchool] = useState(''); const [saved, setSaved] = useState(false);
  return <Screen keyboard scroll contentStyle={styles.screen}><TopBar title="编辑资料" /><View style={styles.block}><Card style={styles.form}><TextField label="昵称" onChangeText={setName} value={name} /><TextField label="院校 / 单位" onChangeText={setSchool} placeholder="选填" value={school} /><TextField label="学习目标" value="ICAO 4 级" editable={false} /><Button onPress={() => setSaved(true)} size="lg">保存到本机演示</Button></Card><AppText variant="caption">此阶段仅验证资料编辑交互，尚未写入真实账户服务。</AppText></View><BottomSheet onClose={() => setSaved(false)} visible={saved}><View style={styles.sheet}><CheckCircle2 color={colors.primary} size={36} /><AppText variant="sectionTitle">已完成保存演示</AppText><AppText>资料未上传云端。</AppText><Button onPress={() => { setSaved(false); router.back(); }}>返回个人资料</Button></View></BottomSheet></Screen>;
}

function SettingsPage() {
  const router = useRouter(); const [autoPlay, setAutoPlay] = useState(true); const [confirm, setConfirm] = useState(false);
  return <Screen scroll contentStyle={styles.screen}><TopBar title="设置" /><View style={styles.block}><Section title="学习设置"><ToggleRow label="自动播放下一条音频" onValueChange={setAutoPlay} value={autoPlay} /></Section><Section title="账户与数据"><Menu label="学习同步" onPress={() => router.push('/account/sync')} /><Menu label="账户安全" onPress={() => router.push('/account/security')} border /><Menu label="权限与系统状态" onPress={() => router.push('/state/gallery')} border /></Section><Section title="关于"><Menu label="帮助与反馈" onPress={() => router.push('/info/help')} /><Menu label="关于 ICAO" onPress={() => router.push('/info/about')} border /></Section><Button leading={<LogOut color={colors.destructive} size={17} />} onPress={() => setConfirm(true)} variant="outline">退出登录演示</Button></View><BottomSheet onClose={() => setConfirm(false)} visible={confirm}><View style={styles.sheet}><LogOut color={colors.destructive} size={34} /><AppText variant="sectionTitle">退出演示账户？</AppText><AppText style={styles.center}>不会删除本机学习记录和标注。</AppText><Button onPress={() => { setConfirm(false); router.replace('/auth/login'); }} variant="destructive">确认退出</Button><Button onPress={() => setConfirm(false)} variant="ghost">取消</Button></View></BottomSheet></Screen>;
}

function SyncPage() {
  const [synced, setSynced] = useState(false);
  return <Screen scroll contentStyle={styles.screen}><TopBar title="学习同步" /><View style={styles.hero}><View style={styles.avatar}><Cloud color={colors.primary} size={30} /></View><AppText variant="pageTitle">跨设备学习同步</AppText><AppText style={styles.center}>当前只展示未来 Supabase 数据同步边界，不连接云端。</AppText></View><View style={styles.block}><Card style={styles.form}><Info label="本机学习记录" value="保留" /><Info label="云端服务" value="未连接" border /><Info label="同步冲突策略" value="待后续阶段确认" border /><Button onPress={() => setSynced(true)} variant="outline">运行同步演示</Button>{synced ? <Tag><CheckCircle2 size={12} /> 演示完成 · 未上传数据</Tag> : null}</Card></View></Screen>;
}

function SecurityPage() {
  const router = useRouter();
  return <Screen scroll contentStyle={styles.screen}><TopBar title="账户安全" /><View style={styles.block}><Card style={styles.security}><View style={styles.securityTop}><Shield color={colors.primary} size={24} /><View style={styles.flex}><AppText variant="cardTitle">安全状态演示</AppText><AppText variant="caption">未接入真实身份认证</AppText></View><Tag>待接入</Tag></View></Card><Section title="登录凭证"><Menu label="更换手机号" onPress={() => router.push('/account/change-phone')} /><Menu label="更换邮箱" onPress={() => router.push('/account/change-email')} border /><Menu label="修改密码" onPress={() => router.push('/account/change-password')} border /></Section><Pressable onPress={() => router.push('/account/delete-account')}><Card style={styles.danger}><Trash2 color={colors.destructive} size={19} /><AppText color={colors.destructive} variant="button">注销账户</AppText><ChevronRight color={colors.destructive} size={18} /></Card></Pressable></View></Screen>;
}

function SecurityForm({ page }: { page: Exclude<AccountSlug, 'profile' | 'edit-profile' | 'settings' | 'sync' | 'security'> }) {
  const [value, setValue] = useState(''); const [done, setDone] = useState(false); const isDelete = page === 'delete-account';
  const copy = { 'change-phone': ['新手机号', '请输入新手机号'], 'change-email': ['新邮箱', 'name@example.com'], 'change-password': ['新密码', '至少 6 位'], 'delete-account': ['确认文字', '输入“确认注销”'] } as const;
  return <Screen keyboard scroll contentStyle={styles.screen}><TopBar title={titles[page]} /><View style={styles.block}>{isDelete ? <Card style={styles.warning}><Trash2 color={colors.destructive} size={26} /><AppText variant="sectionTitle">注销是不可逆操作</AppText><AppText>真实服务接入后，这里将执行再次认证、冷静期和数据删除。本阶段不会删除任何数据。</AppText></Card> : null}<Card style={styles.form}><TextField label={copy[page][0]} onChangeText={setValue} placeholder={copy[page][1]} secureTextEntry={page === 'change-password'} value={value} /><TextField keyboardType="number-pad" label="验证码" placeholder="演示验证码（任意 4 位）" /><Button disabled={!value.trim()} onPress={() => setDone(true)} size="lg" variant={isDelete ? 'destructive' : 'primary'}>{isDelete ? '演示注销流程' : '确认修改演示'}</Button></Card><AppText variant="caption">不会发送验证码，也不会变更或删除真实账户。</AppText></View><BottomSheet onClose={() => setDone(false)} visible={done}><View style={styles.sheet}><CheckCircle2 color={isDelete ? colors.destructive : colors.primary} size={36} /><AppText variant="sectionTitle">流程演示完成</AppText><AppText>没有对真实账户或数据执行操作。</AppText><Button onPress={() => setDone(false)}>我知道了</Button></View></BottomSheet></Screen>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) { return <View style={styles.section}><AppText color={colors.mutedForeground} variant="micro">{title}</AppText><Card style={styles.list}>{children}</Card></View>; }
function Menu({ label, onPress, border = false }: { label: string; onPress: () => void; border?: boolean }) { return <Pressable onPress={onPress} style={[styles.row, border && styles.border]}><AppText style={styles.flex} variant="button">{label}</AppText><ChevronRight color={colors.mutedForeground} size={18} /></Pressable>; }
function ToggleRow({ label, value, onValueChange }: { label: string; value: boolean; onValueChange: (value: boolean) => void }) { return <View style={styles.row}><AppText style={styles.flex} variant="button">{label}</AppText><Switch onValueChange={onValueChange} trackColor={{ true: colors.primary20 }} thumbColor={value ? colors.primary : undefined} value={value} /></View>; }
function Info({ label, value, border = false }: { label: string; value: string; border?: boolean }) { return <View style={[styles.row, border && styles.border]}><AppText>{label}</AppText><AppText color={colors.foreground} style={styles.flexRight} variant="button">{value}</AppText></View>; }

const styles = StyleSheet.create({ screen: { paddingHorizontal: 0 }, block: { gap: spacing[4], padding: spacing[5] }, hero: { alignItems: 'center', gap: spacing[2], padding: spacing[6] }, avatar: { alignItems: 'center', backgroundColor: colors.primary10, borderRadius: radii.xxl, height: 68, justifyContent: 'center', width: 68 }, center: { textAlign: 'center' }, list: { marginHorizontal: spacing[5], padding: 0 }, form: { gap: spacing[4] }, row: { alignItems: 'center', flexDirection: 'row', minHeight: 56, paddingHorizontal: spacing[4] }, border: { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth }, flex: { flex: 1 }, flexRight: { flex: 1, textAlign: 'right' }, section: { gap: spacing[2] }, security: { marginHorizontal: 0 }, securityTop: { alignItems: 'center', flexDirection: 'row', gap: spacing[3] }, danger: { alignItems: 'center', flexDirection: 'row', gap: spacing[3] }, warning: { alignItems: 'center', backgroundColor: 'rgba(219,43,51,0.06)', borderColor: 'rgba(219,43,51,0.15)', gap: spacing[3] }, sheet: { alignItems: 'center', gap: spacing[3], paddingBottom: spacing[4] } });
